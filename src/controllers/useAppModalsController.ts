import { useCallback, useEffect } from "react";
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
    isVaultReady,
    isVaultLocked,
    isVaultUnlocked,
    vaultError,
    handleLocalUnlock,
    handleSignIn,
    handleSignUp,
    handleSignOut,
    clearVaultError,
    localPassword,
  } = useActiveVaultContext();
  const {
    content,
    setContent,
    isDecrypting,
    isContentReady,
    hasEdits,
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
    if (mode === AppMode.Cloud && hasEdits) {
      triggerSync({ immediate: true });
    }
    navigateBackToCalendar();
    if (shouldPromptModeChoice) {
      requestModeChoice();
    }
  }, [
    content,
    hasEdits,
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

  const isSigningIn =
    mode === AppMode.Cloud &&
    auth.authState === AuthState.SignedIn &&
    (!cloudVault.isReady || cloudVault.isBusy);
  const vaultUiState = useVaultUiState({
    showIntro,
    isModeChoiceOpen,
    mode,
    authState: auth.authState,
    isSigningIn,
    isVaultReady,
    isVaultLocked,
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
    auth.backToSignIn();
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
      authState: auth.authState,
      confirmationEmail: auth.confirmationEmail,
      isBusy: auth.isBusy,
      error: auth.error,
      localPassword,
      onDismiss: handleCloudAuthDismiss,
      onBackToSignIn: auth.backToSignIn,
      onSignIn: handleSignIn,
      onSignUp: handleSignUp,
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
      isDecrypting,
      isContentReady,
      content,
      onChange: setContent,
      canNavigatePrev,
      canNavigateNext,
      navigateToPrevious,
      navigateToNext,
    },
  };
}
