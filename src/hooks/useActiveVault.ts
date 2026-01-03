import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UseAuthReturn } from './useAuth';
import { useLocalVault } from './useLocalVault';
import { useVault } from './useVault';
import { AppMode } from './useAppMode';
import { tryDeviceUnlockCloudKey } from '../domain/vault';
import { computeKeyId } from '../storage/keyId';
import { listLocalKeyIds, restoreLocalWrappedKey, storeLocalWrappedKey } from '../storage/localKeyring';

interface UseActiveVaultProps {
  auth: UseAuthReturn;
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

export interface UseActiveVaultReturn {
  auth: UseAuthReturn;
  localVault: ReturnType<typeof useLocalVault>;
  cloudVault: ReturnType<typeof useVault>;
  authPassword: string | null;
  localPassword: string | null;
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  activeKeyId: string | null;
  cloudPrimaryKey: CryptoKey | null;
  isVaultReady: boolean;
  isVaultLocked: boolean;
  isVaultUnlocked: boolean;
  vaultError: string | null;
  handleLocalUnlock: (password: string) => Promise<boolean>;
  handleSignIn: (email: string, password: string) => Promise<void>;
  handleSignUp: (email: string, password: string) => Promise<void>;
  handleSignOut: () => Promise<void>;
  setLocalPassword: (password: string | null) => void;
}

export function useActiveVault({ auth, mode, setMode }: UseActiveVaultProps): UseActiveVaultReturn {
  const localVault = useLocalVault();
  const [authPassword, setAuthPassword] = useState<string | null>(null);
  const [localPassword, setLocalPassword] = useState<string | null>(null);
  const [restoredCloudVaultKey, setRestoredCloudVaultKey] = useState<CryptoKey | null>(null);
  const [localKeyId, setLocalKeyId] = useState<string | null>(null);
  const [localKeyring, setLocalKeyring] = useState<Map<string, CryptoKey>>(new Map());

  const handlePasswordConsumed = useCallback(() => {
    setAuthPassword(null);
  }, []);

  const cloudVault = useVault({
    user: mode === AppMode.Cloud ? auth.user : null,
    password: authPassword,
    localDek: localVault.vaultKey,
    localKeyring,
    onPasswordConsumed: handlePasswordConsumed
  });

  const cloudPrimaryKey = cloudVault.vaultKey ?? restoredCloudVaultKey;

  useEffect(() => {
    if (cloudVault.vaultKey || restoredCloudVaultKey) return;
    let cancelled = false;

    const restoreCloudKey = async () => {
      const result = await tryDeviceUnlockCloudKey();
      if (!cancelled && result) {
        setRestoredCloudVaultKey(result.vaultKey);
        return;
      }
    };

    void restoreCloudKey();

    return () => {
      cancelled = true;
    };
  }, [cloudVault.vaultKey, restoredCloudVaultKey]);

  useEffect(() => {
    const localKey = localVault.vaultKey;
    if (!localKey) return;
    let cancelled = false;

    const loadLocalKeyring = async () => {
      const keyId = await computeKeyId(localKey);
      if (cancelled) return;
      setLocalKeyId(keyId);
      const entries = new Map<string, CryptoKey>();
      entries.set(keyId, localKey);

      const extraKeys = listLocalKeyIds().filter((id) => id !== keyId);
      for (const id of extraKeys) {
        try {
          const restored = await restoreLocalWrappedKey(id, localKey);
          if (restored) {
            entries.set(id, restored);
          }
        } catch {
          // Ignore corrupted entries.
        }
      }
      if (!cancelled) {
        setLocalKeyring(entries);
      }
    };

    void loadLocalKeyring();

    return () => {
      cancelled = true;
    };
  }, [localVault.vaultKey]);

  useEffect(() => {
    const localKey = localVault.vaultKey;
    if (!localKey || !cloudVault.keyring.size) return;

    const cacheCloudKeys = async () => {
      for (const [keyId, key] of cloudVault.keyring.entries()) {
        if (keyId === localKeyId) continue;
        try {
          await storeLocalWrappedKey(keyId, key, localKey);
        } catch (error) {
          console.warn('Failed to cache cloud key locally:', error);
        }
      }
    };

    void cacheCloudKeys();
  }, [cloudVault.keyring, localVault.vaultKey, localKeyId]);

  const mergedKeyring = useMemo(() => {
    const merged = new Map<string, CryptoKey>();
    localKeyring.forEach((value, key) => merged.set(key, value));
    cloudVault.keyring.forEach((value, key) => merged.set(key, value));
    if (cloudVault.primaryKeyId && !merged.has('legacy')) {
      const primary = cloudVault.keyring.get(cloudVault.primaryKeyId);
      if (primary) {
        merged.set('legacy', primary);
      }
    }
    return merged;
  }, [localKeyring, cloudVault.keyring, cloudVault.primaryKeyId]);

  const candidateKeyId =
    mode === AppMode.Cloud && cloudVault.primaryKeyId ? cloudVault.primaryKeyId : localKeyId;
  const activeKeyId =
    candidateKeyId && mergedKeyring.has(candidateKeyId) ? candidateKeyId : null;
  const vaultKey = activeKeyId ? mergedKeyring.get(activeKeyId) ?? null : null;
  const isVaultReady = mode === AppMode.Cloud ? cloudVault.isReady : localVault.isReady;
  const isVaultLocked = mode === AppMode.Cloud ? cloudVault.isLocked : localVault.isLocked;
  const vaultError = mode === AppMode.Cloud ? cloudVault.error : localVault.error;
  const isVaultUnlocked = !isVaultLocked && isVaultReady;

  const handleLocalUnlock = useCallback(async (password: string) => {
    const success = await localVault.unlock(password);
    if (success) {
      setLocalPassword(password);
    }
    return success;
  }, [localVault]);

  const handleSignIn = useCallback(async (email: string, password: string) => {
    const result = await auth.signIn(email, password);
    if (result.success && result.password) {
      setAuthPassword(result.password);
      setMode(AppMode.Cloud);
    }
  }, [auth, setMode]);

  const handleSignUp = useCallback(async (email: string, password: string) => {
    const result = await auth.signUp(email, password);
    if (result.success && result.password) {
      setAuthPassword(result.password);
      setMode(AppMode.Cloud);
    }
  }, [auth, setMode]);

  const handleSignOut = useCallback(async () => {
    await auth.signOut();
    setMode(AppMode.Local);
    setAuthPassword(null);
  }, [auth, setMode]);

  return {
    auth,
    localVault,
    cloudVault,
    authPassword,
    localPassword,
    vaultKey,
    keyring: mergedKeyring,
    activeKeyId,
    cloudPrimaryKey,
    isVaultReady,
    isVaultLocked,
    isVaultUnlocked,
    vaultError,
    handleLocalUnlock,
    handleSignIn,
    handleSignUp,
    handleSignOut,
    setLocalPassword
  };
}
