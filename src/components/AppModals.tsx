import { useCallback, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { NoteEditor } from './NoteEditor';
import { NavigationArrow } from './NavigationArrow';
import { AuthForm } from './AuthForm';
import { VaultUnlock } from './VaultUnlock';
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

  const showLocalVaultModal = !showIntro &&
    mode === AppMode.Local &&
    isVaultLocked &&
    localVault.isReady &&
    localVault.requiresPassword;
  const isSigningIn = auth.authState === AuthState.Loading ||
    (mode === AppMode.Cloud && auth.authState === AuthState.SignedIn && (!cloudVault.isReady || cloudVault.isBusy));
  const showCloudAuthModal = !showIntro &&
    mode === AppMode.Cloud && (
      auth.authState === AuthState.SignedOut ||
      auth.authState === AuthState.AwaitingConfirmation ||
      isSigningIn
    );

  const showModeChoice = isModeChoiceOpen && !showIntro;

  const shouldRenderNoteEditor = isNoteModalOpen && (showModalContent || isClosing);

  return (
    <>
      <Modal isOpen={showIntro} onClose={dismissIntro} variant="overlay">
        <div className="vault-unlock">
          <div className="vault-unlock__card">
            <h2 className="vault-unlock__title">Welcome to DailyNote</h2>
            <p className="vault-unlock__helper">
              A calm place for one note per day. No account required to start.
            </p>
            <ul className="intro-list">
              <li>Your notes are encrypted on this device before storage.</li>
              <li>Sync is optional and keeps encrypted backups in the cloud.</li>
            </ul>
            <div className="vault-unlock__choices">
              <button
                className="button button--primary vault-unlock__button"
                onClick={startWriting}
              >
                Start writing
              </button>
              <button
                className="button button--ghost vault-unlock__button"
                onClick={() => {
                  dismissIntro();
                  switchToCloud();
                }}
              >
                Set up sync
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showModeChoice} onClose={() => {}} variant="overlay">
        <div className="vault-unlock">
          <div className="vault-unlock__card">
            <h2 className="vault-unlock__title">Sync your notes?</h2>
            <p className="vault-unlock__helper">
              Create an account to back up and sync across devices.
            </p>
            <div className="vault-unlock__choices">
              <button
                className="button button--primary vault-unlock__button"
                onClick={switchToCloud}
              >
                Sign in to sync
              </button>
              <button
                className="button button--ghost vault-unlock__button"
                onClick={closeModeChoice}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showLocalVaultModal} onClose={() => {}} variant="overlay">
        <VaultUnlock
          mode={localVault.hasVault ? 'unlock' : 'setup'}
          isBusy={localVault.isBusy}
          error={localVault.error}
          onUnlock={handleLocalUnlock}
          onSwitchToCloud={switchToCloud}
        />
      </Modal>

      <Modal isOpen={showCloudAuthModal} onClose={() => {}} variant="overlay">
        {isSigningIn ? (
          <div className="vault-unlock">
            <div className="vault-unlock__card">
              <div className="note-loading">Signing in...</div>
            </div>
          </div>
        ) : auth.authState === AuthState.AwaitingConfirmation ? (
          <div className="vault-unlock">
            <div className="vault-unlock__card">
              <h2 className="vault-unlock__title">Check your email</h2>
              <p className="vault-unlock__helper">
                We sent a confirmation link to <strong>{auth.confirmationEmail}</strong>.
                Click the link to activate your account.
              </p>
              <button
                className="button button--primary vault-unlock__button"
                onClick={auth.backToSignIn}
              >
                Back to sign in
              </button>
            </div>
          </div>
        ) : (
          <AuthForm
            isBusy={auth.isBusy}
            error={auth.error}
            onSignIn={handleSignIn}
            onSignUp={handleSignUp}
            defaultPassword={localPassword}
          />
        )}
      </Modal>

      <Modal isOpen={!!vaultError && isVaultReady && !showIntro} onClose={() => {}} variant="overlay">
        <div className="vault-unlock">
          <div className="vault-unlock__card">
            <h2 className="vault-unlock__title">Unlock Error</h2>
            <p className="vault-unlock__error">{vaultError}</p>
            <p className="vault-unlock__helper">
              Please try again.
            </p>
            {mode === AppMode.Cloud && (
              <button
                className="button button--primary vault-unlock__button"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </Modal>

      <Modal isOpen={isNoteModalOpen} onClose={handleCloseModal}>
        {date && shouldRenderNoteEditor && (
          <>
            <NavigationArrow
              direction="left"
              onClick={navigateToPrevious}
              disabled={!canNavigatePrev}
              ariaLabel="Previous note"
            />
            <NavigationArrow
              direction="right"
              onClick={navigateToNext}
              disabled={!canNavigateNext}
              ariaLabel="Next note"
            />
            <div ref={modalContentRef} className="note-editor-wrapper">
              <NoteEditor
                date={date}
                content={isContentReady ? content : ''}
                onChange={setContent}
                isClosing={isClosing}
                hasEdits={hasEdits}
                isDecrypting={isDecrypting}
                isContentReady={isContentReady}
              />
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
