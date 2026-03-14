import { useCallback, useEffect, useReducer } from "react";
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
}

type VaultPhase =
  | "signedOut"
  | "deviceUnlocking"
  | "locked"
  | "unlocking"
  | "ready";

export interface VaultState {
  phase: VaultPhase;
  vaultService: VaultService | null;
  userId: string | null;
  password: string | null;
  localDek: CryptoKey | null;
  localKeyring: Map<string, CryptoKey>;
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  primaryKeyId: string | null;
  lastFailedPassword: string | null;
  isReady: boolean;
  isBusy: boolean;
  error: string | null;
}

export type VaultAction =
  | {
      type: "INPUTS_CHANGED";
      vaultService: VaultService;
      user: User | null;
      password: string | null;
      localDek: CryptoKey | null;
      localKeyring: Map<string, CryptoKey>;
    }
  | { type: "DEVICE_UNLOCKED"; vaultKey: CryptoKey; keyId: string }
  | {
      type: "PASSWORD_UNLOCKED";
      vaultKey: CryptoKey;
      keyring: Map<string, CryptoKey>;
      primaryKeyId: string;
    }
  | { type: "UNLOCK_FAILED" }
  | { type: "CLEAR_ERROR" };

const initialState: VaultState = {
  phase: "signedOut",
  vaultService: null,
  userId: null,
  password: null,
  localDek: null,
  localKeyring: new Map(),
  vaultKey: null,
  keyring: new Map(),
  primaryKeyId: null,
  lastFailedPassword: null,
  isReady: false,
  isBusy: false,
  error: null,
};

function applyInputs(
  state: VaultState,
  action: Extract<VaultAction, { type: "INPUTS_CHANGED" }>,
): Partial<VaultState> {
  const passwordChanged = action.password !== state.password;
  return {
    vaultService: action.vaultService,
    userId: action.user?.id ?? null,
    password: action.password,
    localDek: action.localDek,
    localKeyring: action.localKeyring,
    lastFailedPassword: passwordChanged
      ? null
      : state.lastFailedPassword,
  };
}

function maybeAutoUnlock(s: VaultState): VaultState {
  if (
    s.phase === "locked" &&
    s.password &&
    s.password !== s.lastFailedPassword
  ) {
    return {
      ...s,
      phase: "unlocking",
      isBusy: true,
      isReady: false,
      error: null,
    };
  }
  return s;
}

export function vaultReducer(
  state: VaultState,
  action: VaultAction,
): VaultState {
  switch (action.type) {
    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "INPUTS_CHANGED": {
      const inputs = applyInputs(state, action);
      const hasUser = !!action.user;
      const noUser = !action.user;
      const passwordChanged =
        action.password !== state.password;
      const hasPassword =
        !!action.password &&
        action.password !== (passwordChanged
          ? null
          : state.lastFailedPassword);

      switch (state.phase) {
        case "signedOut":
          if (hasUser) {
            return {
              ...state,
              ...inputs,
              phase: "deviceUnlocking",
              isBusy: true,
              isReady: false,
              error: null,
            };
          }
          return { ...state, ...inputs };

        case "deviceUnlocking":
          if (noUser) {
            return {
              ...state,
              ...inputs,
              phase: "signedOut",
              vaultKey: null,
              keyring: new Map(),
              primaryKeyId: null,
              lastFailedPassword: null,
              isReady: true,
              isBusy: false,
              error: null,
            };
          }
          return { ...state, ...inputs };

        case "locked":
          if (noUser) {
            return {
              ...state,
              ...inputs,
              phase: "signedOut",
              vaultKey: null,
              keyring: new Map(),
              primaryKeyId: null,
              lastFailedPassword: null,
              isReady: true,
              isBusy: false,
              error: null,
            };
          }
          if (hasPassword) {
            return {
              ...state,
              ...inputs,
              phase: "unlocking",
              isBusy: true,
              isReady: false,
              error: null,
            };
          }
          return { ...state, ...inputs };

        case "unlocking":
          if (noUser) {
            return {
              ...state,
              ...inputs,
              phase: "signedOut",
              vaultKey: null,
              keyring: new Map(),
              primaryKeyId: null,
              lastFailedPassword: null,
              isReady: true,
              isBusy: false,
              error: null,
            };
          }
          return { ...state, ...inputs };

        case "ready":
          if (noUser) {
            return {
              ...state,
              ...inputs,
              phase: "signedOut",
              vaultKey: null,
              keyring: new Map(),
              primaryKeyId: null,
              lastFailedPassword: null,
              isReady: true,
              isBusy: false,
              error: null,
            };
          }
          return { ...state, ...inputs };
      }
    }
    // eslint-disable-next-line no-fallthrough -- inner switch is exhaustive
    case "DEVICE_UNLOCKED":
      if (state.phase !== "deviceUnlocking") return state;
      return {
        ...state,
        phase: "ready",
        vaultKey: action.vaultKey,
        keyring: new Map([[action.keyId, action.vaultKey]]),
        primaryKeyId: action.keyId,
        isBusy: false,
        isReady: true,
      };

    case "PASSWORD_UNLOCKED":
      if (state.phase !== "unlocking") return state;
      return {
        ...state,
        phase: "ready",
        vaultKey: action.vaultKey,
        keyring: action.keyring,
        primaryKeyId: action.primaryKeyId,
        lastFailedPassword: null,
        isBusy: false,
        isReady: true,
        error: null,
      };

    case "UNLOCK_FAILED":
      if (state.phase === "deviceUnlocking") {
        return maybeAutoUnlock({
          ...state,
          phase: "locked",
          isReady: true,
          isBusy: false,
        });
      }
      if (state.phase === "unlocking") {
        return maybeAutoUnlock({
          ...state,
          phase: "locked",
          isBusy: false,
          isReady: true,
          error:
            "Unable to unlock. Check your password and try again.",
          lastFailedPassword: state.password,
        });
      }
      return state;
  }
}

export function useVault({
  vaultService,
  user,
  password,
  localDek,
  localKeyring,
}: UseVaultProps): UseVaultReturn {
  const [state, dispatch] = useReducer(vaultReducer, initialState);
  useEffect(() => {
    dispatch({
      type: "INPUTS_CHANGED",
      vaultService,
      user,
      password,
      localDek,
      localKeyring,
    });
  }, [vaultService, user, password, localDek, localKeyring]);

  // Device unlock effect
  useEffect(() => {
    if (state.phase !== "deviceUnlocking") return;
    if (!state.vaultService) return;

    let cancelled = false;
    const service = state.vaultService;

    const run = async () => {
      const result = await service.tryDeviceUnlockCloudKey();
      if (cancelled) return;
      if (result) {
        dispatch({
          type: "DEVICE_UNLOCKED",
          vaultKey: result.vaultKey,
          keyId: result.keyId,
        });
      } else {
        dispatch({ type: "UNLOCK_FAILED" });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [state.phase, state.vaultService]);

  // Password unlock effect
  useEffect(() => {
    if (state.phase !== "unlocking") return;
    if (!state.vaultService || !state.userId || !state.password) {
      return;
    }

    let cancelled = false;
    const service = state.vaultService;
    const userId = state.userId;
    const pw = state.password;
    const dek = state.localDek;
    const kr = state.localKeyring;

    const run = async () => {
      try {
        const result = await service.unlockCloudVault({
          userId,
          password: pw,
          localDek: dek,
          localKeyring: kr,
        });
        if (!cancelled && result.vaultKey && result.primaryKeyId) {
          dispatch({
            type: "PASSWORD_UNLOCKED",
            vaultKey: result.vaultKey,
            keyring: result.keyring,
            primaryKeyId: result.primaryKeyId,
          });
        }
      } catch (error) {
        console.error("Vault unlock error:", error);
        if (!cancelled) {
          dispatch({ type: "UNLOCK_FAILED" });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    state.phase,
    state.vaultService,
    state.userId,
    state.password,
    state.localDek,
    state.localKeyring,
  ]);

  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  return {
    vaultKey: state.vaultKey,
    keyring: state.keyring,
    primaryKeyId: state.primaryKeyId,
    isReady: state.isReady,
    isLocked: !state.vaultKey,
    isBusy: state.isBusy,
    error: state.error,
    clearError,
  };
}
