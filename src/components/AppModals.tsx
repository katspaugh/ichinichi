import { useCallback, useEffect, useRef } from 'react';
import { IntroModal } from './AppModals/IntroModal';
import { ModeChoiceModal } from './AppModals/ModeChoiceModal';
import { LocalVaultModal } from './AppModals/LocalVaultModal';
import { CloudAuthModal } from './AppModals/CloudAuthModal';
import { VaultErrorModal } from './AppModals/VaultErrorModal';
import { NoteModal } from './AppModals/NoteModal';
import { isContentEmpty } from '../utils/sanitize';
import { AppMode } from '../hooks/useAppMode';
import { useModalTransition } from '../hooks/useModalTransition';
import { useNoteNavigation } from '../hooks/useNoteNavigation';
import { useNoteKeyboardNav } from '../hooks/useNoteKeyboardNav';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { AuthState, ViewType } from '../types';
import { useActiveVaultContext } from '../contexts/activeVaultContext';
import { useAppModeContext } from '../contexts/appModeContext';
import { useNoteRepositoryContext } from '../contexts/noteRepositoryContext';
import { useUrlStateContext } from '../contexts/urlStateContext';
import { useVaultUiState } from '../hooks/useVaultUiState';

export function AppModals() {
  const {
    mode,
    isModeChoiceOpen,
    pendingModeChoice,
    openModeChoice,
    closeModeChoice,
    requestModeChoice,
    switchToCloud
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
    localPassword
  } = useActiveVaultContext();
  const {
    content,
    setContent,
    isDecrypting,
    isContentReady,
    hasEdits,
    noteDates,
    triggerSync
  } = useNoteRepositoryContext();
  const {
    view,
    date,
    year,
    navigateToCalendar,
    navigateToDate,
    showIntro,
    dismissIntro,
    startWriting
  } = useUrlStateContext();
  const isNoteModalOpen = view === ViewType.Note && date !== null && isVaultUnlocked;

  const handleCloseComplete = useCallback(() => {
    const hasLocalNote = noteDates.size > 0 || !isContentEmpty(content);
    const shouldPromptModeChoice = mode === AppMode.Local && hasLocalNote;
    if (mode === AppMode.Cloud && hasEdits) {
      triggerSync({ immediate: true });
    }
    navigateToCalendar(year);
    if (shouldPromptModeChoice) {
      requestModeChoice();
    }
  }, [content, hasEdits, mode, navigateToCalendar, noteDates.size, requestModeChoice, triggerSync, year]);

  const {
    showContent: showModalContent,
    isClosing,
    requestClose: handleCloseModal
  } = useModalTransition({
    isOpen: isNoteModalOpen,
    onCloseComplete: handleCloseComplete,
    openDelayMs: 100,
    resetDelayMs: 0,
    closeDelayMs: hasEdits ? 200 : 0
  });

  // Note navigation
  const {
    canNavigatePrev,
    canNavigateNext,
    navigateToPrevious,
    navigateToNext
  } = useNoteNavigation({
    currentDate: date,
    noteDates,
    onNavigate: navigateToDate
  });

  // Keyboard navigation (arrow keys when not editing)
  useNoteKeyboardNav({
    enabled: isNoteModalOpen && !isDecrypting,
    onPrevious: navigateToPrevious,
    onNext: navigateToNext,
    contentEditableSelector: '.note-editor__content'
  });

  // Swipe gesture navigation (mobile)
  const modalContentRef = useRef<HTMLDivElement>(null);

  useSwipeGesture({
    enabled: isNoteModalOpen && !isDecrypting,
    onSwipeLeft: navigateToNext,
    onSwipeRight: navigateToPrevious,
    elementRef: modalContentRef,
    threshold: 50
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

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  }, [mode, isVaultUnlocked, triggerSync]);

  const isSigningIn = auth.authState === AuthState.Loading ||
    (mode === AppMode.Cloud && auth.authState === AuthState.SignedIn && (!cloudVault.isReady || cloudVault.isBusy));
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
    localRequiresPassword: localVault.requiresPassword
  });

  const shouldRenderNoteEditor = isNoteModalOpen && (showModalContent || isClosing);

  return (
    <>
      <IntroModal
        isOpen={vaultUiState === 'intro'}
        onDismiss={dismissIntro}
        onStartWriting={startWriting}
        onSetupSync={switchToCloud}
      />

      <ModeChoiceModal
        isOpen={vaultUiState === 'modeChoice'}
        onConfirm={switchToCloud}
        onDismiss={closeModeChoice}
      />

      <LocalVaultModal
        isOpen={vaultUiState === 'localVault'}
        hasVault={localVault.hasVault}
        isBusy={localVault.isBusy}
        error={localVault.error}
        onUnlock={handleLocalUnlock}
        onSwitchToCloud={switchToCloud}
      />

      <CloudAuthModal
        isOpen={vaultUiState === 'cloudAuth'}
        isSigningIn={isSigningIn}
        authState={auth.authState}
        confirmationEmail={auth.confirmationEmail}
        isBusy={auth.isBusy}
        error={auth.error}
        localPassword={localPassword}
        onBackToSignIn={auth.backToSignIn}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
      />

      <VaultErrorModal
        isOpen={vaultUiState === 'vaultError'}
        error={vaultError}
        mode={mode}
        onSignOut={handleSignOut}
      />

      <NoteModal
        isOpen={isNoteModalOpen}
        onClose={handleCloseModal}
        date={date}
        shouldRenderNoteEditor={shouldRenderNoteEditor}
        isClosing={isClosing}
        hasEdits={hasEdits}
        isDecrypting={isDecrypting}
        isContentReady={isContentReady}
        content={content}
        onChange={setContent}
        canNavigatePrev={canNavigatePrev}
        canNavigateNext={canNavigateNext}
        navigateToPrevious={navigateToPrevious}
        navigateToNext={navigateToNext}
        modalContentRef={modalContentRef}
      />
    </>
  );
}
