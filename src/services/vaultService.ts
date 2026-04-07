import type { SupabaseClient } from "@supabase/supabase-js";
import type { VaultService } from "../domain/vault/vaultService";
import {
  fetchUserKeyring,
  saveUserKeyringEntry,
  deleteUserKeyringEntry,
} from "../storage/userKeyring";
import {
  base64ToBytes,
  bytesToBase64,
  decodeUtf8,
  encodeUtf8,
  randomBytes,
} from "../storage/cryptoUtils";
import { sanitizeHtml } from "../utils/sanitize";
import { parseDecryptedNotePayload, parseRemoteNoteRow, type RemoteNoteRow } from "../storage/parsers";
import type { UserKeyringEntry } from "../storage/userKeyring";
import { computeKeyId } from "../storage/keyId";
import {
  deriveKEK,
  generateDEK,
  wrapDEK,
  unwrapDEK,
  generateSalt,
  DEFAULT_KDF_ITERATIONS,
  storeDeviceWrappedDEK,
  tryUnlockWithDeviceDEK,
  tryGetDeviceEncryptedPassword,
  hasVaultMeta,
  createVault,
  createRandomVault,
  unlockWithPassword,
  tryUnlockWithDeviceKey,
  ensureDeviceWrappedKey,
  canUseDeviceKey,
} from "../storage/vault";

export interface CloudVaultUnlockResult {
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  primaryKeyId: string | null;
}

export async function tryDeviceUnlockCloudKey(): Promise<{
  vaultKey: CryptoKey;
  keyId: string;
} | null> {
  const dek = await tryUnlockWithDeviceDEK();
  if (!dek) return null;

  // If there is no device-encrypted password stored, we cannot guarantee
  // the cloud keyring entries are wrapped with the current password.
  // Return null so the caller falls through to password entry, which
  // triggers unlockCloudVault → device DEK fallback → re-wrap.
  const hasStoredPassword = await tryGetDeviceEncryptedPassword();
  if (!hasStoredPassword) return null;

  const keyId = await computeKeyId(dek);
  return { vaultKey: dek, keyId };
}

export async function unlockCloudVault(options: {
  supabase: SupabaseClient;
  userId: string;
  password: string;
  localDek: CryptoKey | null;
  localKeyring: Map<string, CryptoKey>;
}): Promise<CloudVaultUnlockResult> {
  const { supabase, userId, password, localDek, localKeyring } = options;
  const nextKeyring = new Map<string, CryptoKey>();
  let nextPrimaryId: string | null = null;

  const existingKeyrings = await fetchUserKeyring(supabase, userId);

  let dek: CryptoKey | null = null;

  if (existingKeyrings.length && !nextKeyring.size) {
    let passwordUnwrapFailed = false;

    for (const entry of existingKeyrings) {
      try {
        const kek = await deriveKEK(password, entry.kdfSalt, entry.kdfIterations);
        const unwrapped = await unwrapDEK(entry.wrappedDek, entry.dekIv, kek);
        nextKeyring.set(entry.keyId, unwrapped);
        if (entry.isPrimary && !nextPrimaryId) {
          nextPrimaryId = entry.keyId;
        }
      } catch {
        passwordUnwrapFailed = true;
      }
    }

    // Password doesn't match stored wrapping (e.g. password was reset
    // before the rewrap fix). Fall back to device-wrapped DEK if available.
    // NOTE: we intentionally do NOT rewrap here on page load.
    // Rewrap only on explicit password reset or debug "Rewrap all keys" button.
    if (!nextKeyring.size && passwordUnwrapFailed) {
      const deviceDek = await tryUnlockWithDeviceDEK();
      if (deviceDek) {
        const keyId = await computeKeyId(deviceDek);
        nextKeyring.set(keyId, deviceDek);
        nextPrimaryId = keyId;
      } else {
        throw new Error("Unable to unlock. Check your password and try again.");
      }
    }
  }

  if (!nextPrimaryId && existingKeyrings.length) {
    nextPrimaryId = existingKeyrings[0]?.keyId ?? null;
    if (nextPrimaryId) {
      await saveUserKeyringEntry(supabase, userId, {
        ...existingKeyrings[0],
        isPrimary: true,
      });
    }
  }

  if (!existingKeyrings.length) {
    const salt = generateSalt();
    const kek = await deriveKEK(password, salt, DEFAULT_KDF_ITERATIONS);
    dek = localDek ?? (await generateDEK());
    const wrapped = await wrapDEK(dek, kek);
    const keyId = await computeKeyId(dek);
    const entry: UserKeyringEntry = {
      keyId,
      wrappedDek: wrapped.data,
      dekIv: wrapped.iv,
      kdfSalt: salt,
      kdfIterations: DEFAULT_KDF_ITERATIONS,
      version: 1,
      isPrimary: true,
    };
    await saveUserKeyringEntry(supabase, userId, entry);
    nextKeyring.set(keyId, dek);
    nextPrimaryId = keyId;
  }

  // Only upload local keys to cloud when there are no existing cloud keyrings.
  // When cloud keyrings exist, the cloud primary is authoritative — uploading
  // a fresh local DEK from every new browser would pollute the keyring.
  if (!existingKeyrings.length) {
    if (localDek) {
      const localKeyId = await computeKeyId(localDek);
      if (!nextKeyring.has(localKeyId)) {
        const salt = generateSalt();
        const kek = await deriveKEK(password, salt, DEFAULT_KDF_ITERATIONS);
        const wrapped = await wrapDEK(localDek, kek);
        const entry: UserKeyringEntry = {
          keyId: localKeyId,
          wrappedDek: wrapped.data,
          dekIv: wrapped.iv,
          kdfSalt: salt,
          kdfIterations: DEFAULT_KDF_ITERATIONS,
          version: 1,
          isPrimary: false,
        };
        await saveUserKeyringEntry(supabase, userId, entry);
        nextKeyring.set(localKeyId, localDek);
      }
    }

    if (localKeyring.size) {
      for (const [keyId, key] of localKeyring.entries()) {
        if (nextKeyring.has(keyId)) continue;
        const salt = generateSalt();
        const kek = await deriveKEK(password, salt, DEFAULT_KDF_ITERATIONS);
        const wrapped = await wrapDEK(key, kek);
        const entry: UserKeyringEntry = {
          keyId,
          wrappedDek: wrapped.data,
          dekIv: wrapped.iv,
          kdfSalt: salt,
          kdfIterations: DEFAULT_KDF_ITERATIONS,
          version: 1,
          isPrimary: false,
        };
        await saveUserKeyringEntry(supabase, userId, entry);
        nextKeyring.set(keyId, key);
      }
    }
  }

  if (!nextPrimaryId && nextKeyring.size) {
    nextPrimaryId = Array.from(nextKeyring.keys())[0] ?? null;
  }

  if (nextPrimaryId) {
    dek = nextKeyring.get(nextPrimaryId) ?? null;
  }

  if (dek) {
    await storeDeviceWrappedDEK(dek);
  }

  return {
    vaultKey: dek,
    keyring: nextKeyring,
    primaryKeyId: nextPrimaryId,
  };
}

export async function rewrapCloudKeyring(options: {
  supabase: SupabaseClient;
  userId: string;
  newPassword: string;
  keyring: Map<string, CryptoKey>;
  primaryKeyId: string | null;
}): Promise<void> {
  const { supabase, userId, newPassword, keyring, primaryKeyId } = options;

  for (const [keyId, key] of keyring.entries()) {
    const salt = generateSalt();
    const kek = await deriveKEK(newPassword, salt, DEFAULT_KDF_ITERATIONS);
    const wrapped = await wrapDEK(key, kek);
    const entry: UserKeyringEntry = {
      keyId,
      wrappedDek: wrapped.data,
      dekIv: wrapped.iv,
      kdfSalt: salt,
      kdfIterations: DEFAULT_KDF_ITERATIONS,
      version: 1,
      isPrimary: keyId === primaryKeyId,
    };
    await saveUserKeyringEntry(supabase, userId, entry);
  }
}

export async function ensureCloudKeyringPassword(options: {
  supabase: SupabaseClient;
  userId: string;
  password: string;
  keyring: Map<string, CryptoKey>;
  primaryKeyId: string | null;
}): Promise<void> {
  const { supabase, userId, password, keyring, primaryKeyId } = options;
  if (!keyring.size) return;
  await rewrapCloudKeyring({ supabase, userId, newPassword: password, keyring, primaryKeyId });
}

export function getHasLocalVault(): boolean {
  return hasVaultMeta();
}

export async function bootstrapLocalVault(): Promise<{
  hasVault: boolean;
  requiresPassword: boolean;
  vaultKey: CryptoKey | null;
}> {
  const existing = hasVaultMeta();
  if (!existing) {
    const deviceKeyAvailable = await canUseDeviceKey();
    if (deviceKeyAvailable) {
      const key = await createRandomVault();
      return { hasVault: true, requiresPassword: false, vaultKey: key };
    }
    return { hasVault: false, requiresPassword: true, vaultKey: null };
  }

  const unlocked = await tryUnlockWithDeviceKey();
  if (unlocked) {
    return { hasVault: true, requiresPassword: false, vaultKey: unlocked };
  }
  return { hasVault: true, requiresPassword: true, vaultKey: null };
}

export async function unlockLocalVault(options: {
  password: string;
  hasVault: boolean;
}): Promise<{
  vaultKey: CryptoKey;
  hasVault: boolean;
}> {
  const { password, hasVault } = options;
  let key: CryptoKey;
  if (hasVault) {
    key = await unlockWithPassword(password);
  } else {
    key = await createVault(password);
  }
  await ensureDeviceWrappedKey(key);
  return {
    vaultKey: key,
    hasVault: true,
  };
}

export async function fetchAndUnwrapCloudKeyring(options: {
  supabase: SupabaseClient;
  userId: string;
  password: string;
}): Promise<{ keyring: Map<string, CryptoKey>; primaryKeyId: string | null }> {
  const { supabase, userId, password } = options;
  const entries = await fetchUserKeyring(supabase, userId);
  const keyring = new Map<string, CryptoKey>();
  let primaryKeyId: string | null = null;

  for (const entry of entries) {
    try {
      const kek = await deriveKEK(password, entry.kdfSalt, entry.kdfIterations);
      const unwrapped = await unwrapDEK(entry.wrappedDek, entry.dekIv, kek);
      keyring.set(entry.keyId, unwrapped);
      if (entry.isPrimary) primaryKeyId = entry.keyId;
    } catch {
      // Skip entries that can't be unwrapped with this password
    }
  }

  return { keyring, primaryKeyId };
}

const NOTE_IV_BYTES = 12;

export async function cleanupUnusedKeys(options: {
  supabase: SupabaseClient;
  userId: string;
  activeKeyId: string | null;
  keyring: Map<string, CryptoKey>;
}): Promise<{ deleted: string[]; reencrypted: number; kept: string[] }> {
  const { supabase, userId, activeKeyId, keyring } = options;

  const primaryKey = activeKeyId ? keyring.get(activeKeyId) : null;

  // Fetch remote notes and re-encrypt any that use non-primary keys
  const { data: remoteRows, error: remoteError } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .eq("deleted", false);

  if (remoteError) throw remoteError;

  const usedKeyIds = new Set<string>();
  let reencrypted = 0;

  for (const row of remoteRows ?? []) {
    const note = parseRemoteNoteRow(row);
    if (!note) continue;

    // If note uses primary key, keep as-is
    if (note.key_id === activeKeyId) {
      usedKeyIds.add(note.key_id);
      continue;
    }

    // Try to re-encrypt to primary key
    const oldKey = keyring.get(note.key_id ?? "legacy");
    if (!oldKey || !primaryKey || !activeKeyId) {
      // Can't re-encrypt — must keep this key
      if (note.key_id) usedKeyIds.add(note.key_id);
      continue;
    }

    const iv = base64ToBytes(note.nonce);
    const ciphertext = base64ToBytes(note.ciphertext);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      oldKey,
      ciphertext,
    );
    const parsed = parseDecryptedNotePayload(
      JSON.parse(decodeUtf8(new Uint8Array(decrypted))),
    );
    if (!parsed) {
      if (note.key_id) usedKeyIds.add(note.key_id);
      continue;
    }

    const newIv = randomBytes(NOTE_IV_BYTES);
    const envelope = { content: sanitizeHtml(parsed.content) };
    const plaintext = encodeUtf8(JSON.stringify(envelope));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: newIv },
      primaryKey,
      plaintext,
    );

    const newCiphertext = bytesToBase64(new Uint8Array(encrypted));
    const newNonce = bytesToBase64(newIv);
    const now = new Date().toISOString();

    const { error: pushError } = await supabase
      .from("notes")
      .upsert({
        id: note.id,
        user_id: userId,
        date: note.date,
        key_id: activeKeyId,
        ciphertext: newCiphertext,
        nonce: newNonce,
        updated_at: now,
        _deleted: false,
      }, { onConflict: "id" });
    if (pushError) throw pushError;

    // RxDB replication will pull the re-encrypted note automatically
    reencrypted++;
  }

  // Also collect keyIds used by images on the server

  const { data: remoteImages, error: imgError } = await supabase
    .from("note_images")
    .select("key_id")
    .eq("user_id", userId)
    .eq("deleted", false);
  if (!imgError && remoteImages) {
    for (const img of remoteImages) {
      if (img.key_id) usedKeyIds.add(img.key_id);
    }
  }

  // Delete all non-primary keyring entries that are no longer referenced
  const entries = await fetchUserKeyring(supabase, userId);
  const deleted: string[] = [];
  const kept: string[] = [];

  for (const entry of entries) {
    if (entry.keyId === activeKeyId || usedKeyIds.has(entry.keyId)) {
      kept.push(entry.keyId);
    } else {
      await deleteUserKeyringEntry(supabase, userId, entry.keyId);
      deleted.push(entry.keyId);
    }
  }

  // Also remove deleted keys from local storage
  if (deleted.length) {
    const { removeLocalWrappedKeys } = await import("../storage/localKeyring");
    removeLocalWrappedKeys(deleted);
  }

  return { deleted, reencrypted, kept };
}

export async function reencryptCloudNotes(options: {
  supabase: SupabaseClient;
  userId: string;
  password: string;
  keyring: Map<string, CryptoKey>;
  primaryKeyId: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ reencrypted: number; deleted: string[] }> {
  const { supabase: sb, userId, password, keyring, primaryKeyId, onProgress } = options;

  const primaryKey = keyring.get(primaryKeyId);
  if (!primaryKey) throw new Error("Primary DEK not found in keyring");

  // 1. Fetch all remote notes
  const { data: rows, error } = await sb
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .eq("deleted", false);
  if (error) throw error;

  const notes = (rows ?? [])
    .map(parseRemoteNoteRow)
    .filter(Boolean) as RemoteNoteRow[];

  // 2. Re-encrypt notes that use non-primary keys
  let reencrypted = 0;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    onProgress?.(i, notes.length);

    if (note.key_id === primaryKeyId) continue;

    const oldKey = keyring.get(note.key_id ?? "legacy");
    if (!oldKey) throw new Error(`DEK not found for keyId ${note.key_id}`);

    // Decrypt
    const iv = base64ToBytes(note.nonce);
    const ciphertext = base64ToBytes(note.ciphertext);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      oldKey,
      ciphertext,
    );
    const parsed = parseDecryptedNotePayload(
      JSON.parse(decodeUtf8(new Uint8Array(decrypted))),
    );
    if (!parsed) throw new Error(`Failed to parse decrypted note ${note.date}`);

    // Re-encrypt with primary key
    const newIv = randomBytes(NOTE_IV_BYTES);
    const envelope = { content: sanitizeHtml(parsed.content) };
    const plaintext = encodeUtf8(JSON.stringify(envelope));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: newIv },
      primaryKey,
      plaintext,
    );

    const newCiphertext = bytesToBase64(new Uint8Array(encrypted));
    const newNonce = bytesToBase64(newIv);
    const now = new Date().toISOString();

    // Push to Supabase
    const { error: pushError } = await sb
      .from("notes")
      .upsert({
        id: note.id,
        user_id: userId,
        date: note.date,
        key_id: primaryKeyId,
        ciphertext: newCiphertext,
        nonce: newNonce,
        updated_at: now,
        _deleted: false,
      }, { onConflict: "id" });
    if (pushError) throw pushError;

    // RxDB replication will pull the re-encrypted note automatically
    reencrypted++;
  }

  onProgress?.(notes.length, notes.length);

  // 3. Delete all non-primary keyring entries from Supabase
  const entries = await fetchUserKeyring(sb, userId);
  const deleted: string[] = [];
  for (const entry of entries) {
    if (entry.keyId === primaryKeyId) continue;
    await deleteUserKeyringEntry(sb, userId, entry.keyId);
    deleted.push(entry.keyId);
  }

  // 4. Also remove from local keyring
  if (deleted.length) {
    const { removeLocalWrappedKeys } = await import("../storage/localKeyring");
    removeLocalWrappedKeys(deleted);
  }

  // 5. Rewrap primary DEK with password KEK
  const salt = generateSalt();
  const kek = await deriveKEK(password, salt, DEFAULT_KDF_ITERATIONS);
  const wrapped = await wrapDEK(primaryKey, kek);
  await saveUserKeyringEntry(sb, userId, {
    keyId: primaryKeyId,
    wrappedDek: wrapped.data,
    dekIv: wrapped.iv,
    kdfSalt: salt,
    kdfIterations: DEFAULT_KDF_ITERATIONS,
    version: 1,
    isPrimary: true,
  });

  return { reencrypted, deleted };
}

export function createVaultService(supabase: SupabaseClient): VaultService {
  return {
    tryDeviceUnlockCloudKey,
    unlockCloudVault: (options) =>
      unlockCloudVault({ supabase, ...options }),
    getHasLocalVault,
    bootstrapLocalVault,
    unlockLocalVault,
  };
}
