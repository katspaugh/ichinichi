import { useMemo } from "react";
import { AppMode } from "./useAppMode";
import { AuthState } from "../types";

export type VaultUiState =
  | "intro"
  | "modeChoice"
  | "localVault"
  | "cloudAuth"
  | "vaultError"
  | "none";

interface VaultUiInputs {
  showIntro: boolean;
  isModeChoiceOpen: boolean;
  mode: AppMode;
  authState: AuthState;
  isSigningIn: boolean;
  isVaultReady: boolean;
  isVaultLocked: boolean;
  isVaultBusy: boolean;
  hasPasswordPending: boolean;
  vaultError: string | null;
  localVaultReady: boolean;
  localRequiresPassword: boolean;
}

function deriveUiState(inputs: VaultUiInputs): VaultUiState {
  if (inputs.showIntro) return "intro";
  if (inputs.isModeChoiceOpen) return "modeChoice";
  if (
    inputs.mode === AppMode.Local &&
    inputs.isVaultLocked &&
    inputs.localVaultReady &&
    inputs.localRequiresPassword
  ) {
    return "localVault";
  }
  if (inputs.mode === AppMode.Cloud) {
    // Show auth modal when not signed in or still signing in
    if (
      inputs.authState === AuthState.SignedOut ||
      inputs.authState === AuthState.Loading ||
      inputs.isSigningIn
    ) {
      return "cloudAuth";
    }
    // Show vault unlock when signed in but vault is locked (and not currently unlocking)
    // Don't show if password is pending - it will auto-unlock
    if (
      inputs.authState === AuthState.SignedIn &&
      inputs.isVaultLocked &&
      inputs.isVaultReady &&
      !inputs.isVaultBusy &&
      !inputs.hasPasswordPending
    ) {
      return "cloudAuth";
    }
  }
  if (inputs.vaultError && inputs.isVaultReady) {
    return "vaultError";
  }
  return "none";
}

export function useVaultUiState(inputs: VaultUiInputs): VaultUiState {
  const {
    showIntro,
    isModeChoiceOpen,
    mode,
    authState,
    isSigningIn,
    isVaultReady,
    isVaultLocked,
    isVaultBusy,
    hasPasswordPending,
    vaultError,
    localVaultReady,
    localRequiresPassword,
  } = inputs;

  return useMemo(
    () =>
      deriveUiState({
        showIntro,
        isModeChoiceOpen,
        mode,
        authState,
        isSigningIn,
        isVaultReady,
        isVaultLocked,
        isVaultBusy,
        hasPasswordPending,
        vaultError,
        localVaultReady,
        localRequiresPassword,
      }),
    [
      showIntro,
      isModeChoiceOpen,
      mode,
      authState,
      isSigningIn,
      isVaultReady,
      isVaultLocked,
      isVaultBusy,
      hasPasswordPending,
      vaultError,
      localVaultReady,
      localRequiresPassword,
    ],
  );
}
