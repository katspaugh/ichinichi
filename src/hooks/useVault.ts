import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { VaultService } from "../domain/vault";

export interface UseVaultReturn {
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  primaryKeyId: string | null;
  isReady: boolean;
  isLocked: boolean;
  isBusy: boolean;
  error: string | null;
  clearError: () => void;
}

interface UseVaultProps {
  vaultService: VaultService;
  user: User | null;
  password: string | null;
  localDek: CryptoKey | null;
  localKeyring: Map<string, CryptoKey>;
  onPasswordConsumed: () => void;
}

export function useVault({
  vaultService,
  user,
  password,
  localDek,
  localKeyring,
  onPasswordConsumed,
}: UseVaultProps): UseVaultReturn {
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [keyring, setKeyring] = useState<Map<string, CryptoKey>>(new Map());
  const [primaryKeyId, setPrimaryKeyId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlockingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const userId = user?.id ?? null;

  // Try device unlock when user signs in
  useEffect(() => {
    if (!userId) {
      lastUserIdRef.current = null;
      setVaultKey(null);
      setKeyring(new Map());
      setPrimaryKeyId(null);
      setIsReady(true);
      return;
    }

    if (lastUserIdRef.current === userId) {
      return;
    }

    lastUserIdRef.current = userId;

    let cancelled = false;

    const tryDeviceUnlock = async () => {
      const result = await vaultService.tryDeviceUnlockCloudKey();
      if (!cancelled && result) {
        setVaultKey(result.vaultKey);
        setKeyring(new Map([[result.keyId, result.vaultKey]]));
        setPrimaryKeyId(result.keyId);
      }
      if (!cancelled) {
        setIsReady(true);
      }
    };

    void tryDeviceUnlock();

    return () => {
      cancelled = true;
    };
  }, [userId, vaultService]);

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
        const result = await vaultService.unlockCloudVault({
          userId: user.id,
          password,
          localDek,
          localKeyring,
        });
        setVaultKey(result.vaultKey);
        setKeyring(result.keyring);
        setPrimaryKeyId(result.primaryKeyId);
        setError(null);
      } catch (err) {
        console.error("Vault unlock error:", err);
        setError("Unable to unlock. Check your password and try again.");
      } finally {
        setIsBusy(false);
        setIsReady(true);
        unlockingRef.current = false;
        onPasswordConsumed();
      }
    };

    void unlock();
  }, [
    user,
    password,
    vaultKey,
    localDek,
    localKeyring,
    onPasswordConsumed,
    vaultService,
  ]);

  // Clear vault on sign out
  const clearVault = useCallback(async () => {
    setVaultKey(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
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
    error,
    clearError,
  };
}
