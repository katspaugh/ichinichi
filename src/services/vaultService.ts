import type { SupabaseClient } from "@supabase/supabase-js";
import type { VaultService } from "../domain/vault/vaultService";
import {
  fetchUserKeyring,
  saveUserKeyringEntry,
  deleteUserKeyringEntry,
} from "../storage/userKeyring";
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
    if (!nextKeyring.size && passwordUnwrapFailed) {
      const deviceDek = await tryUnlockWithDeviceDEK();
      if (deviceDek) {
        const keyId = await computeKeyId(deviceDek);
        nextKeyring.set(keyId, deviceDek);
        nextPrimaryId = keyId;

        // Re-wrap with current password so other devices can unlock
        await rewrapCloudKeyring({
          supabase,
          userId,
          newPassword: password,
          keyring: nextKeyring,
          primaryKeyId: nextPrimaryId,
        });
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

export async function cleanupUnusedKeys(options: {
  supabase: SupabaseClient;
  userId: string;
  activeKeyId: string | null;
}): Promise<{ deleted: string[]; kept: string[] }> {
  const { supabase, userId, activeKeyId } = options;

  // Collect keyIds referenced by local notes (IndexedDB)
  const { getAllNoteRecords } = await import("../storage/unifiedNoteStore");
  const localRecords = await getAllNoteRecords();
  const usedKeyIds = new Set(localRecords.map((r) => r.keyId));

  // Collect keyIds referenced by remote notes (Supabase)
  const { data: remoteRows, error: remoteError } = await supabase
    .from("notes")
    .select("key_id")
    .eq("user_id", userId)
    .eq("deleted", false);

  if (remoteError) throw remoteError;
  for (const row of remoteRows ?? []) {
    const keyId = (row as Record<string, unknown>).key_id;
    if (typeof keyId === "string") usedKeyIds.add(keyId);
  }

  // Fetch all keyring entries and determine which to delete
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

  return { deleted, kept };
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
