import { useCallback, useEffect, useRef, useState } from "react";
import { isContentEmpty } from "../utils/sanitize";
import { AppMode } from "../hooks/useAppMode";
import { useModalTransition } from "../hooks/useModalTransition";
import { useNoteNavigation } from "../hooks/useNoteNavigation";
import { useNoteKeyboardNav } from "../hooks/useNoteKeyboardNav";
import { AuthState, ViewType } from "../types";
import { useActiveVaultContext } from "../contexts/activeVaultContext";
import { useAppModeContext } from "../contexts/appModeContext";
import { useNoteRepositoryContext } from "../contexts/noteRepositoryContext";
import { useUrlStateContext } from "../contexts/urlStateContext";
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
      // Start timer to show after delay
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
      // Clear any pending timer when value becomes false
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Reset delayed value via timeout to satisfy lint rule
      const resetTimer = setTimeout(() => {
        setDelayedValue(false);
      }, 0);
      return () => clearTimeout(resetTimer);
    }
  }, [value, delayMs]);

  // Return false immediately when value is false (don't wait for state update)
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
    content,
    setContent,
    isDecrypting,
    isContentReady,
    isOfflineStub,
    hasEdits,
    isSaving,
    noteDates,
    triggerSync,
  } = useNoteRepositoryContext();
  const {
    view,
    date,
    navigateBackToCalendar,
    navigateToDate,
    showIntro,
    dismissIntro,
    startWriting,
  } = useUrlStateContext();
  const isNoteModalOpen =
    view === ViewType.Note && date !== null && isVaultUnlocked;

  const handleCloseComplete = useCallback(() => {
    const hasLocalNote = noteDates.size > 0 || !isContentEmpty(content);
    const shouldPromptModeChoice = mode === AppMode.Local && hasLocalNote;
    // In cloud mode, always trigger immediate sync on close to push any pending ops
    // (the note may have been saved locally but not yet synced to cloud)
    if (mode === AppMode.Cloud) {
      triggerSync({ immediate: true });
    }
    navigateBackToCalendar();
    if (shouldPromptModeChoice) {
      requestModeChoice();
    }
  }, [
    content,
    mode,
    navigateBackToCalendar,
    noteDates.size,
    requestModeChoice,
    triggerSync,
  ]);

  const {
    showContent: showModalContent,
    isClosing,
    requestClose: handleCloseModal,
  } = useModalTransition({
    isOpen: isNoteModalOpen,
    onCloseComplete: handleCloseComplete,
    openDelayMs: 100,
    resetDelayMs: 0,
    closeDelayMs: hasEdits ? 200 : 0,
  });

  const {
    canNavigatePrev,
    canNavigateNext,
    navigateToPrevious,
    navigateToNext,
  } = useNoteNavigation({
    currentDate: date,
    noteDates,
    onNavigate: navigateToDate,
  });

  useNoteKeyboardNav({
    enabled: isNoteModalOpen && !isDecrypting,
    onPrevious: navigateToPrevious,
    onNext: navigateToNext,
    contentEditableSelector: '[data-note-editor="content"]',
  });

  useEffect(() => {
    if (!pendingModeChoice || isNoteModalOpen) return;
    openModeChoice();
  }, [pendingModeChoice, isNoteModalOpen, openModeChoice]);

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
  // Delay showing "Signing in..." to avoid flash on page reload
  // when session is restored quickly
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

  const shouldRenderNoteEditor =
    isNoteModalOpen && (showModalContent || isClosing);

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
      onStartWriting: startWriting,
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
    noteModal: {
      isOpen: isNoteModalOpen,
      onClose: handleCloseModal,
      date,
      shouldRenderNoteEditor,
      isClosing,
      hasEdits,
      isSaving,
      isDecrypting,
      isContentReady,
      isOfflineStub,
      content,
      onChange: setContent,
      canNavigatePrev,
      canNavigateNext,
      navigateToPrevious,
      navigateToNext,
    },
  };
}
