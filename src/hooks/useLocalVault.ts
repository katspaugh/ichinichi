import { useCallback, useEffect, useReducer } from "react";
import type { VaultService } from "../domain/vault";

export interface UseLocalVaultReturn {
  vaultKey: CryptoKey | null;
  isReady: boolean;
  isLocked: boolean;
  hasVault: boolean;
  requiresPassword: boolean;
  isBusy: boolean;
  error: string | null;
  unlock: (password: string) => Promise<boolean>;
  clearError: () => void;
}

type LocalVaultPhase = "loading" | "ready" | "unlocking";

interface LocalVaultState {
  phase: LocalVaultPhase;
  vaultKey: CryptoKey | null;
  hasVault: boolean;
  requiresPassword: boolean;
  error: string | null;
}

type LocalVaultEvent =
  | {
      type: "BOOTSTRAP_SUCCESS";
      hasVault: boolean;
      requiresPassword: boolean;
      vaultKey: CryptoKey | null;
    }
  | { type: "BOOTSTRAP_ERROR" }
  | { type: "UNLOCK_START" }
  | { type: "UNLOCK_SUCCESS"; vaultKey: CryptoKey; hasVault: boolean }
  | { type: "UNLOCK_ERROR"; error: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" };

function localVaultReducer(
  state: LocalVaultState,
  event: LocalVaultEvent,
): LocalVaultState {
  switch (event.type) {
    case "BOOTSTRAP_SUCCESS":
      return {
        ...state,
        phase: "ready",
        hasVault: event.hasVault,
        requiresPassword: event.requiresPassword,
        vaultKey: event.vaultKey ?? state.vaultKey,
      };
    case "BOOTSTRAP_ERROR":
      return {
        ...state,
        phase: "ready",
        error: "Unable to initialize local vault.",
      };
    case "UNLOCK_START":
      return { ...state, phase: "unlocking", error: null };
    case "UNLOCK_SUCCESS":
      return {
        ...state,
        phase: "ready",
        vaultKey: event.vaultKey,
        hasVault: event.hasVault,
        requiresPassword: false,
      };
    case "UNLOCK_ERROR":
      return { ...state, phase: "ready", error: event.error };
    case "SET_ERROR":
      return { ...state, error: event.error };
    case "CLEAR_ERROR":
      return { ...state, error: null };
  }
}

export function useLocalVault({
  vaultService,
}: {
  vaultService: VaultService;
}): UseLocalVaultReturn {
  const [state, dispatch] = useReducer(localVaultReducer, {
    phase: "loading",
    vaultKey: null,
    hasVault: vaultService.getHasLocalVault(),
    requiresPassword: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await vaultService.bootstrapLocalVault();
        if (!cancelled) {
          dispatch({
            type: "BOOTSTRAP_SUCCESS",
            hasVault: result.hasVault,
            requiresPassword: result.requiresPassword,
            vaultKey: result.vaultKey ?? null,
          });
        }
      } catch {
        if (!cancelled) {
          dispatch({ type: "BOOTSTRAP_ERROR" });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [vaultService]);

  const unlock = useCallback(
    async (password: string): Promise<boolean> => {
      if (!password.trim()) {
        dispatch({ type: "SET_ERROR", error: "Please enter a password." });
        return false;
      }

      dispatch({ type: "UNLOCK_START" });

      try {
        const result = await vaultService.unlockLocalVault({
          password,
          hasVault: state.hasVault,
        });
        dispatch({
          type: "UNLOCK_SUCCESS",
          vaultKey: result.vaultKey,
          hasVault: result.hasVault,
        });
        return true;
      } catch {
        dispatch({
          type: "UNLOCK_ERROR",
          error: "Unable to unlock. Check your password and try again.",
        });
        return false;
      }
    },
    [state.hasVault, vaultService],
  );

  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  return {
    vaultKey: state.vaultKey,
    isReady: state.phase !== "loading",
    isLocked: !state.vaultKey,
    hasVault: state.hasVault,
    requiresPassword: state.requiresPassword,
    isBusy: state.phase === "unlocking",
    error: state.error,
    unlock,
    clearError,
  };
}
