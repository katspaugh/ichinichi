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
import {
  ensureCloudKeyringPassword,
  fetchAndUnwrapCloudKeyring,
} from "../services/vaultService";
import {
  storeDeviceEncryptedPassword,
  tryGetDeviceEncryptedPassword,
  clearDeviceEncryptedPassword,
} from "../storage/vault";
import { supabase } from "../lib/supabase";

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

  // Cloud keyring fetched after device-only unlock (keys from other devices).
  const [fetchedCloudKeys, setFetchedCloudKeys] = useState<Map<string, CryptoKey>>(new Map());
  const [fetchedCloudPrimaryId, setFetchedCloudPrimaryId] = useState<string | null>(null);
  // Whether the post-device-unlock cloud key fetch has completed (success or error).
  const [cloudKeysFetched, setCloudKeysFetched] = useState(false);

  const mergedKeyring = useMemo(() => {
    const merged = new Map<string, CryptoKey>();
    state.context.localKeyring.forEach((value, key) => merged.set(key, value));
    cloudVault.keyring.forEach((value, key) => merged.set(key, value));
    fetchedCloudKeys.forEach((value, key) => merged.set(key, value));
    const effectivePrimaryId = fetchedCloudPrimaryId ?? cloudVault.primaryKeyId;
    if (effectivePrimaryId && !merged.has("legacy")) {
      const primary = merged.get(effectivePrimaryId);
      if (primary) {
        merged.set("legacy", primary);
      }
    }
    return merged;
  }, [state.context.localKeyring, cloudVault.keyring, cloudVault.primaryKeyId, fetchedCloudKeys, fetchedCloudPrimaryId]);

  const cloudPrimaryKey =
    cloudVault.vaultKey ?? state.context.restoredCloudVaultKey;

  const cloudPrimaryKeyId = fetchedCloudPrimaryId ?? cloudVault.primaryKeyId;
  const candidateKeyId =
    mode === AppMode.Cloud && cloudPrimaryKeyId
      ? cloudPrimaryKeyId
      : state.context.localKeyId;
  const activeKeyId =
    candidateKeyId && mergedKeyring.has(candidateKeyId) ? candidateKeyId : null;
  const vaultKey = activeKeyId
    ? (mergedKeyring.get(activeKeyId) ?? null)
    : null;

  // On session restore, retrieve device-encrypted password so we can
  // re-wrap the cloud keyring even without the user typing their password.
  const [devicePassword, setDevicePassword] = useState<string | null>(null);
  useEffect(() => {
    if (
      mode !== AppMode.Cloud ||
      !auth.user ||
      authPassword ||
      !cloudVault.isReady
    ) {
      return;
    }
    let cancelled = false;
    void tryGetDeviceEncryptedPassword().then((pw) => {
      if (!cancelled && pw) setDevicePassword(pw);
    });
    return () => { cancelled = true; };
  }, [mode, auth.user, authPassword, cloudVault.isReady]);

  // After device-only unlock, fetch the full cloud keyring so keys from
  // other devices (e.g. a PWA installation) are available for decryption.
  const hasFetchedCloudKeysRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== AppMode.Cloud || !auth.user || !devicePassword || !cloudVault.isReady) return;
    // Password unlock already fetches all keys — only needed after device unlock.
    if (authPassword) return;

    const cacheKey = `${auth.user.id}:${devicePassword}`;
    if (hasFetchedCloudKeysRef.current === cacheKey) return;
    hasFetchedCloudKeysRef.current = cacheKey;

    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchAndUnwrapCloudKeyring({
          supabase,
          userId: auth.user!.id,
          password: devicePassword,
        });
        if (cancelled) return;
        if (result.keyring.size) {
          setFetchedCloudKeys(result.keyring);
          if (result.primaryKeyId) setFetchedCloudPrimaryId(result.primaryKeyId);
        }
      } catch (e) {
        console.error("Failed to fetch cloud keyring after device unlock:", e);
      } finally {
        if (!cancelled) setCloudKeysFetched(true);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, auth.user, devicePassword, authPassword, cloudVault.isReady]);

  // Persist auth password device-encrypted whenever it changes.
  useEffect(() => {
    if (authPassword) {
      void storeDeviceEncryptedPassword(authPassword);
    }
  }, [authPassword]);

  // Sync all available keys to cloud keyring when password is available.
  // Covers: stale wrapping after password reset, local keys not yet in cloud.
  const effectivePassword = authPassword ?? devicePassword;
  const hasSyncedKeyringRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      mode !== AppMode.Cloud ||
      !auth.user ||
      !effectivePassword ||
      !cloudVault.isReady ||
      !mergedKeyring.size
    ) {
      return;
    }
    // On device-only unlock, wait for cloud key fetch to complete so
    // mergedKeyring includes all cloud keys before rewrapping.
    if (!authPassword && !cloudKeysFetched) return;
    const cacheKey = `${auth.user.id}:${effectivePassword}`;
    if (hasSyncedKeyringRef.current === cacheKey) return;
    hasSyncedKeyringRef.current = cacheKey;

    // Filter out "legacy" — it's a synthetic alias, not a real keyId
    const keysToSync = new Map<string, CryptoKey>();
    for (const [keyId, key] of mergedKeyring.entries()) {
      if (keyId !== "legacy") {
        keysToSync.set(keyId, key);
      }
    }
    if (!keysToSync.size) return;

    void ensureCloudKeyringPassword({
      supabase,
      userId: auth.user.id,
      password: effectivePassword,
      keyring: keysToSync,
      primaryKeyId: activeKeyId,
    });
  }, [mode, auth.user, effectivePassword, cloudVault.isReady, mergedKeyring, activeKeyId, authPassword, cloudKeysFetched]);

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
    void clearDeviceEncryptedPassword();
    setMode(AppMode.Local);
    setAuthPassword(null);
    setDevicePassword(null);
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
