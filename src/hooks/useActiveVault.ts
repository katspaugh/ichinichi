import { useCallback, useEffect, useMemo, useState } from "react";
import type { UseAuthReturn } from "./useAuth";
import { useLocalVault } from "./useLocalVault";
import { useVault } from "./useVault";
import { AppMode } from "./useAppMode";
import { useServiceContext } from "../contexts/serviceContext";
import { useVaultMachine } from "./useVaultMachine";

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
  handleCloudVaultUnlock: (password: string) => void;
  clearVaultError: () => void;
  setLocalPassword: (password: string | null) => void;
}

export function useActiveVault({
  auth,
  mode,
  setMode,
}: UseActiveVaultProps): UseActiveVaultReturn {
  const { vaultService } = useServiceContext();
  const localVault = useLocalVault({ vaultService });
  const [authPassword, setAuthPassword] = useState<string | null>(null);
  const [localPassword, setLocalPassword] = useState<string | null>(null);
  const [state, send] = useVaultMachine();

  const cloudVault = useVault({
    vaultService,
    user: mode === AppMode.Cloud ? auth.user : null,
    password: authPassword,
    localDek: localVault.vaultKey,
    localKeyring: state.context.localKeyring,
  });

  useEffect(() => {
    send({
      type: "INPUTS_CHANGED",
      vaultService,
      mode,
      authUserId: auth.user?.id ?? null,
      vaultKey: localVault.vaultKey,
      cloudKeyring: cloudVault.keyring,
      cloudPrimaryKeyId: cloudVault.primaryKeyId,
      localKeyring: state.context.localKeyring,
    });
  }, [
    send,
    vaultService,
    mode,
    auth.user,
    localVault.vaultKey,
    cloudVault.keyring,
    cloudVault.primaryKeyId,
    state.context.localKeyring,
  ]);

  const mergedKeyring = useMemo(() => {
    const merged = new Map<string, CryptoKey>();
    state.context.localKeyring.forEach((value, key) => merged.set(key, value));
    cloudVault.keyring.forEach((value, key) => merged.set(key, value));
    if (cloudVault.primaryKeyId && !merged.has("legacy")) {
      const primary = cloudVault.keyring.get(cloudVault.primaryKeyId);
      if (primary) {
        merged.set("legacy", primary);
      }
    }
    return merged;
  }, [state.context.localKeyring, cloudVault.keyring, cloudVault.primaryKeyId]);

  const cloudPrimaryKey =
    cloudVault.vaultKey ?? state.context.restoredCloudVaultKey;

  const candidateKeyId =
    mode === AppMode.Cloud && cloudVault.primaryKeyId
      ? cloudVault.primaryKeyId
      : state.context.localKeyId;
  const activeKeyId =
    candidateKeyId && mergedKeyring.has(candidateKeyId) ? candidateKeyId : null;
  const vaultKey = activeKeyId
    ? (mergedKeyring.get(activeKeyId) ?? null)
    : null;

  const isVaultReady =
    mode === AppMode.Cloud ? cloudVault.isReady : localVault.isReady;
  const isVaultLocked =
    mode === AppMode.Cloud ? cloudVault.isLocked : localVault.isLocked;
  const vaultError =
    mode === AppMode.Cloud ? cloudVault.error : localVault.error;
  const isVaultUnlocked = !isVaultLocked && isVaultReady;

  const handleLocalUnlock = useCallback(
    async (password: string) => {
      const success = await localVault.unlock(password);
      if (success) {
        setLocalPassword(password);
      }
      return success;
    },
    [localVault],
  );

  const handleSignIn = useCallback(
    async (email: string, password: string) => {
      const result = await auth.signIn(email, password);
      if (result.success && result.password) {
        setAuthPassword(result.password);
        setMode(AppMode.Cloud);
      }
    },
    [auth, setMode],
  );

  const handleSignUp = useCallback(
    async (email: string, password: string) => {
      const result = await auth.signUp(email, password);
      if (result.success && result.password) {
        setAuthPassword(result.password);
        setMode(AppMode.Cloud);
      }
    },
    [auth, setMode],
  );

  const handleSignOut = useCallback(async () => {
    await auth.signOut();
    setMode(AppMode.Local);
    setAuthPassword(null);
  }, [auth, setMode]);

  const handleCloudVaultUnlock = useCallback((password: string) => {
    setAuthPassword(password);
  }, []);

  const clearVaultError = useCallback(() => {
    if (mode === AppMode.Cloud) {
      cloudVault.clearError();
      return;
    }
    localVault.clearError();
  }, [cloudVault, localVault, mode]);

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
    handleCloudVaultUnlock,
    clearVaultError,
    setLocalPassword,
  };
}
