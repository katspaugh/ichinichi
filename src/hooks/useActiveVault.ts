import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UseAuthReturn } from "./useAuth";
import { useLocalVault } from "./useLocalVault";
import { useVault } from "./useVault";
import { AppMode } from "./useAppMode";
import { AuthState } from "../types";
import { useServiceContext } from "../contexts/serviceContext";
import { useVaultMachine } from "./useVaultMachine";
import { handleCloudAccountSwitch } from "../storage/accountSwitch";
import { closeUnifiedDb } from "../storage/unifiedDb";

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
  handleSignIn: (email: string, password: string) => void;
  handleSignUp: (email: string, password: string) => void;
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

  useEffect(() => {
    void handleCloudAccountSwitch(auth.user?.id ?? null);
  }, [auth.user?.id]);

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

  const pendingPasswordRef = useRef<string | null>(null);

  // Set authPassword + switch to Cloud only after auth actually succeeds
  useEffect(() => {
    if (auth.authState === AuthState.SignedIn && pendingPasswordRef.current) {
      setAuthPassword(pendingPasswordRef.current);
      setMode(AppMode.Cloud);
      pendingPasswordRef.current = null;
    } else if (
      auth.authState === AuthState.SignedOut &&
      !auth.isBusy &&
      pendingPasswordRef.current
    ) {
      // Auth failed — clear pending password
      pendingPasswordRef.current = null;
    }
  }, [auth.authState, auth.isBusy, setMode]);

  const handleSignIn = useCallback(
    (email: string, password: string) => {
      pendingPasswordRef.current = password;
      auth.signIn(email, password);
    },
    [auth],
  );

  const handleSignUp = useCallback(
    (email: string, password: string) => {
      pendingPasswordRef.current = password;
      auth.signUp(email, password);
    },
    [auth],
  );

  const handleSignOut = useCallback(async () => {
    await auth.signOut();
    closeUnifiedDb();
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
