import { useCallback, useEffect, useState } from 'react';
import {
  bootstrapLocalVault,
  getHasLocalVault,
  unlockLocalVault
} from '../services/vaultService';

export interface UseLocalVaultReturn {
  vaultKey: CryptoKey | null;
  isReady: boolean;
  isLocked: boolean;
  hasVault: boolean;
  requiresPassword: boolean;
  isBusy: boolean;
  error: string | null;
  unlock: (password: string) => Promise<boolean>;
}

export function useLocalVault(): UseLocalVaultReturn {
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasVault, setHasVault] = useState(getHasLocalVault());
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await bootstrapLocalVault();
        if (!cancelled) {
          setHasVault(result.hasVault);
          setRequiresPassword(result.requiresPassword);
          if (result.vaultKey) {
            setVaultKey(result.vaultKey);
          }
          setIsReady(true);
        }
      } catch {
        if (!cancelled) {
          setError('Unable to initialize local vault.');
          setIsReady(true);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const unlock = useCallback(async (password: string): Promise<boolean> => {
    if (!password.trim()) {
      setError('Please enter a password.');
      return false;
    }

    setIsBusy(true);
    setError(null);

    try {
      const result = await unlockLocalVault({ password, hasVault });
      setVaultKey(result.vaultKey);
      setHasVault(result.hasVault);
      setRequiresPassword(false);
      return true;
    } catch {
      setError('Unable to unlock. Check your password and try again.');
      return false;
    } finally {
      setIsBusy(false);
      setIsReady(true);
    }
  }, [hasVault]);

  return {
    vaultKey,
    isReady,
    isLocked: !vaultKey,
    hasVault,
    requiresPassword,
    isBusy,
    error,
    unlock
  };
}
