import { useCallback, useEffect, useRef, useState } from "react";
import { AppMode } from "../hooks/useAppMode";
import { AuthState, ViewType } from "../types";
import { useActiveVaultContext } from "../contexts/activeVaultContext";
import { useAppModeContext } from "../contexts/appModeContext";
import { useNoteRepositoryContext } from "../contexts/noteRepositoryContext";
import { useRoutingContext } from "../contexts/routingContext";
import { useVaultUiState } from "../hooks/useVaultUiState";

/**
 * Returns true only after the input has been true for at least `delayMs`.
 * Returns false immediately when input becomes false.
 */
function useDelayedTrue(value: boolean, delayMs: number): boolean {
  const [delayedValue, setDelayedValue] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value) {
      timerRef.current = setTimeout(() => {
        setDelayedValue(true);
      }, delayMs);

      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const resetTimer = setTimeout(() => {
        setDelayedValue(false);
      }, 0);
      return () => clearTimeout(resetTimer);
    }
  }, [value, delayMs]);

  return value ? delayedValue : false;
}

export function useAppModalsController() {
  const {
    mode,
    setMode,
    isModeChoiceOpen,
    pendingModeChoice,
    openModeChoice,
    closeModeChoice,
    requestModeChoice,
    switchToCloud,
  } = useAppModeContext();
  const {
    auth,
    localVault,
    cloudVault,
    authPassword,
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
    localPassword,
  } = useActiveVaultContext();
  const {
    noteDates,
    triggerSync,
  } = useNoteRepositoryContext();
  const {
    view,
    date,
    showIntro,
    dismissIntro,
  } = useRoutingContext();
  const isDayView =
    view === ViewType.Day && date !== null && isVaultUnlocked;

  // When leaving day view, trigger sync and prompt mode choice
  const prevIsDayViewRef = useRef(isDayView);
  useEffect(() => {
    const wasInDayView = prevIsDayViewRef.current;
    prevIsDayViewRef.current = isDayView;

    if (wasInDayView && !isDayView) {
      if (mode === AppMode.Cloud) {
        triggerSync({ immediate: true });
      }
      const hasLocalNote = noteDates.size > 0;
      if (mode === AppMode.Local && hasLocalNote) {
        requestModeChoice();
      }
    }
  }, [isDayView, mode, noteDates.size, requestModeChoice, triggerSync]);

  // Open pending mode choice only when not in day view
  useEffect(() => {
    if (!pendingModeChoice || isDayView) return;
    openModeChoice();
  }, [pendingModeChoice, isDayView, openModeChoice]);

  useEffect(() => {
    if (mode !== AppMode.Cloud || !isVaultUnlocked) {
      return;
    }

    const handlePageExit = () => {
      triggerSync({ immediate: true });
    };

    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener("beforeunload", handlePageExit);

    return () => {
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener("beforeunload", handlePageExit);
    };
  }, [mode, isVaultUnlocked, triggerSync]);

  const isSigningInRaw =
    mode === AppMode.Cloud &&
    auth.authState === AuthState.SignedIn &&
    (!cloudVault.isReady || cloudVault.isBusy);
  const isSigningIn = useDelayedTrue(isSigningInRaw, 300);
  const isVaultBusy = mode === AppMode.Cloud ? cloudVault.isBusy : localVault.isBusy;
  const hasPasswordPending = mode === AppMode.Cloud && !!authPassword;
  const vaultUiState = useVaultUiState({
    showIntro,
    isModeChoiceOpen,
    mode,
    authState: auth.authState,
    isSigningIn,
    isVaultReady,
    isVaultLocked,
    isVaultBusy,
    hasPasswordPending,
    vaultError,
    localVaultReady: localVault.isReady,
    localRequiresPassword: localVault.requiresPassword,
  });

  const handleCloudAuthDismiss = useCallback(() => {
    auth.clearError();
    if (auth.authState === AuthState.SignedIn) {
      void handleSignOut();
      return;
    }
    setMode(AppMode.Local);
  }, [auth, handleSignOut, setMode]);

  return {
    introModal: {
      isOpen: vaultUiState === "intro",
      onDismiss: dismissIntro,
      onSetupSync: switchToCloud,
    },
    modeChoiceModal: {
      isOpen: vaultUiState === "modeChoice",
      onConfirm: switchToCloud,
      onDismiss: closeModeChoice,
    },
    localVaultModal: {
      isOpen: vaultUiState === "localVault",
      hasVault: localVault.hasVault,
      isBusy: localVault.isBusy,
      error: localVault.error,
      onUnlock: handleLocalUnlock,
      onSwitchToCloud: switchToCloud,
    },
    cloudAuthModal: {
      isOpen: vaultUiState === "cloudAuth",
      isSigningIn,
      isVaultLocked: auth.authState === AuthState.SignedIn && isVaultLocked,
      isBusy: auth.isBusy || cloudVault.isBusy,
      error: auth.error || cloudVault.error,
      localPassword,
      onDismiss: handleCloudAuthDismiss,
      onSignIn: handleSignIn,
      onSignUp: handleSignUp,
      onVaultUnlock: handleCloudVaultUnlock,
    },
    vaultErrorModal: {
      isOpen: vaultUiState === "vaultError",
      error: vaultError,
      mode,
      onSignOut: handleSignOut,
      onDismiss: clearVaultError,
    },
  };
}
