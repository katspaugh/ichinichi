import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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
  tryUnlockWithDeviceDEK
} from '../storage/vault';

export interface UseVaultReturn {
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  primaryKeyId: string | null;
  isReady: boolean;
  isLocked: boolean;
  isBusy: boolean;
  error: string | null;
}

interface UseVaultProps {
  user: User | null;
  password: string | null;
  localDek: CryptoKey | null;
  localKeyring: Map<string, CryptoKey>;
  onPasswordConsumed: () => void;
}

export function useVault({
  user,
  password,
  localDek,
  localKeyring,
  onPasswordConsumed
}: UseVaultProps): UseVaultReturn {
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [keyring, setKeyring] = useState<Map<string, CryptoKey>>(new Map());
  const [primaryKeyId, setPrimaryKeyId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlockingRef = useRef(false);

  // Try device unlock when user signs in
  useEffect(() => {
    if (!user) {
        setVaultKey(null);
        setKeyring(new Map());
        setPrimaryKeyId(null);
        setIsReady(true);
        return;
    }

    let cancelled = false;

    const tryDeviceUnlock = async () => {
      const dek = await tryUnlockWithDeviceDEK();
      if (!cancelled && dek) {
        const keyId = await computeKeyId(dek);
        setVaultKey(dek);
        setKeyring(new Map([[keyId, dek]]));
        setPrimaryKeyId(keyId);
      }
      if (!cancelled) {
        setIsReady(true);
      }
    };

    void tryDeviceUnlock();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Unlock with password when provided
  useEffect(() => {
    if (!user || !password || vaultKey || unlockingRef.current) {
      return;
    }

    unlockingRef.current = true;
    setIsBusy(true);
    setError(null);

    const unlock = async () => {
      try {
        const nextKeyring = new Map<string, CryptoKey>();
        let nextPrimaryId: string | null = null;

        // Fetch existing keys from Supabase
        const existingKeyrings = await fetchUserKeyring(supabase, user.id);

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
            await saveUserKeyringEntry(supabase, user.id, {
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
          await saveUserKeyringEntry(supabase, user.id, entry);
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
            await saveUserKeyringEntry(supabase, user.id, entry);
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
            await saveUserKeyringEntry(supabase, user.id, entry);
            nextKeyring.set(keyId, key);
          }
        }

        if (!nextPrimaryId && nextKeyring.size) {
          nextPrimaryId = Array.from(nextKeyring.keys())[0] ?? null;
        }

        if (nextPrimaryId) {
          dek = nextKeyring.get(nextPrimaryId) ?? null;
        }

        // Store device-wrapped DEK for future auto-unlock
        if (dek) {
          await storeDeviceWrappedDEK(dek);
        }

        setVaultKey(dek);
        setKeyring(nextKeyring);
        setPrimaryKeyId(nextPrimaryId);
        setError(null);
      } catch (err) {
        console.error('Vault unlock error:', err);
        setError('Unable to unlock. Check your password and try again.');
      } finally {
        setIsBusy(false);
        setIsReady(true);
        unlockingRef.current = false;
        onPasswordConsumed();
      }
    };

    void unlock();
  }, [user, password, vaultKey, localDek, localKeyring, onPasswordConsumed]);

  // Clear vault on sign out
  const clearVault = useCallback(async () => {
    setVaultKey(null);
  }, []);

  // Listen for sign out
  useEffect(() => {
    if (!user && vaultKey) {
      void clearVault();
    }
  }, [user, vaultKey, clearVault]);

  return {
    vaultKey,
    keyring,
    primaryKeyId,
    isReady,
    isLocked: !vaultKey,
    isBusy,
    error
  };
}
