import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchUserKeyring, saveUserKeyringEntry } from '../storage/userKeyring';
import type { UserKeyringEntry } from '../storage/userKeyring';
import { computeKeyId } from '../storage/keyId';
import {
  deriveKEK,
  generateDEK,
  wrapDEK,
  unwrapDEK,
  generateSalt,
  DEFAULT_KDF_ITERATIONS,
  storeDeviceWrappedDEK,
  tryUnlockWithDeviceDEK,
  hasVaultMeta,
  createVault,
  createRandomVault,
  unlockWithPassword,
  tryUnlockWithDeviceKey,
  ensureDeviceWrappedKey,
  canUseDeviceKey
} from '../storage/vault';

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
    for (const entry of existingKeyrings) {
      const kek = await deriveKEK(
        password,
        entry.kdfSalt,
        entry.kdfIterations
      );
      const unwrapped = await unwrapDEK(entry.wrappedDek, entry.dekIv, kek);
      nextKeyring.set(entry.keyId, unwrapped);
      if (entry.isPrimary && !nextPrimaryId) {
        nextPrimaryId = entry.keyId;
      }
    }
  }

  if (!nextPrimaryId && existingKeyrings.length) {
    nextPrimaryId = existingKeyrings[0]?.keyId ?? null;
    if (nextPrimaryId) {
      await saveUserKeyringEntry(supabase, userId, {
        ...existingKeyrings[0],
        isPrimary: true
      });
    }
  }

  if (!existingKeyrings.length) {
    const salt = generateSalt();
    const kek = await deriveKEK(password, salt, DEFAULT_KDF_ITERATIONS);
    dek = localDek ?? await generateDEK();
    const wrapped = await wrapDEK(dek, kek);
    const keyId = await computeKeyId(dek);
    const entry: UserKeyringEntry = {
      keyId,
      wrappedDek: wrapped.data,
      dekIv: wrapped.iv,
      kdfSalt: salt,
      kdfIterations: DEFAULT_KDF_ITERATIONS,
      version: 1,
      isPrimary: true
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
        isPrimary: false
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
        isPrimary: false
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
    primaryKeyId: nextPrimaryId
  };
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
    hasVault: true
  };
}
