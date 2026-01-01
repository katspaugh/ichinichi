import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar } from './components/Calendar';
import { Modal } from './components/Modal';
import { NoteEditor } from './components/NoteEditor';
import { AuthForm } from './components/AuthForm';
import { VaultUnlock } from './components/VaultUnlock';
import { useUrlState } from './hooks/useUrlState';
import { useAuth } from './hooks/useAuth';
import { useVault } from './hooks/useVault';
import { useLocalVault } from './hooks/useLocalVault';
import { useNotes } from './hooks/useNotes';
import { useSync } from './hooks/useSync';
import { supabase } from './lib/supabase';
import { createSyncedNoteRepository } from './storage/syncedNoteRepository';
import { createEncryptedNoteRepository } from './storage/noteStorage';
import { isContentEmpty } from './utils/sanitize';
import { STORAGE_PREFIX } from './utils/constants';
import type { SyncedNoteRepository } from './storage/syncedNoteRepository';
import type { NoteRepository } from './storage/noteRepository';

import './styles/theme.css';
import './styles/reset.css';
import './styles/components.css';

type AppMode = 'local' | 'cloud' | null;
const CLOUD_PROMPT_KEY = `${STORAGE_PREFIX}cloud_prompted_v1`;
const LOCAL_MIGRATION_KEY = `${STORAGE_PREFIX}local_migrated_v1`;

function App() {
  const { view, date, year, navigateToDate, navigateToCalendar, navigateToYear } = useUrlState();

  // Mode: local (offline) or cloud (Supabase sync)
  const [mode, setMode] = useState<AppMode>(null);
  const [isModeChoiceOpen, setIsModeChoiceOpen] = useState(false);
  const [pendingModeChoice, setPendingModeChoice] = useState(false);
  const hasShownModeChoiceRef = useRef(
    typeof window !== 'undefined' && localStorage.getItem(CLOUD_PROMPT_KEY) === '1'
  );
  const [hasMigratedLocal, setHasMigratedLocal] = useState(
    typeof window !== 'undefined' && localStorage.getItem(LOCAL_MIGRATION_KEY) === '1'
  );

  // Auth for cloud mode
  const auth = useAuth();

  // Local vault for local mode
  const localVault = useLocalVault();

  // Store password temporarily for cloud KEK derivation
  const [authPassword, setAuthPassword] = useState<string | null>(null);

  // Track local password for pre-filling cloud signup
  const [localPassword, setLocalPassword] = useState<string | null>(null);

  const handlePasswordConsumed = useCallback(() => {
    setAuthPassword(null);
  }, []);

  // Cloud vault (only used when in cloud mode and signed in)
  const cloudVault = useVault({
    user: mode === 'cloud' ? auth.user : null,
    password: authPassword,
    localDek: localVault.vaultKey,
    onPasswordConsumed: handlePasswordConsumed
  });

  // Auto-detect mode on load
  useEffect(() => {
    if (mode === 'cloud') return;

    // If user is signed in, prefer cloud mode even after initial load.
    if (auth.authState === 'signed_in') {
      setMode('cloud');
      return;
    }

    if (mode === 'local') return;
    setMode('local');
  }, [mode, auth.authState]);

  // Get the active vault key based on mode
  const vaultKey = mode === 'cloud' ? cloudVault.vaultKey : mode === 'local' ? localVault.vaultKey : null;
  const isVaultReady = mode === 'cloud' ? cloudVault.isReady : localVault.isReady;
  const isVaultLocked = mode === 'cloud' ? cloudVault.isLocked : localVault.isLocked;
  const vaultError = mode === 'cloud' ? cloudVault.error : localVault.error;

  // Create repository based on mode
  const repository = useMemo<NoteRepository | SyncedNoteRepository | null>(() => {
    if (!vaultKey) return null;

    if (mode === 'cloud' && auth.user) {
      return createSyncedNoteRepository(supabase, auth.user.id, vaultKey);
    }

    return createEncryptedNoteRepository(vaultKey);
  }, [mode, auth.user, vaultKey]);

  // Sync only works in cloud mode
  const syncedRepo = mode === 'cloud' ? repository as SyncedNoteRepository : null;
  const { syncStatus, triggerSync } = useSync(syncedRepo);

  const { content, setContent, hasNote, isDecrypting, refreshNoteDates, noteDates } = useNotes(
    date,
    repository,
    year,
    mode === 'cloud' ? triggerSync : undefined
  );

  // Refresh note dates when sync completes
  useEffect(() => {
    if (syncStatus === 'synced') {
      refreshNoteDates();
    }
  }, [syncStatus, refreshNoteDates]);

  // Handle local vault unlock - store password for potential cloud signup
  const handleLocalUnlock = useCallback(async (password: string) => {
    const success = await localVault.unlock(password);
    if (success) {
      setLocalPassword(password);
    }
    return success;
  }, [localVault]);

  // Handle cloud sign in
  const handleSignIn = useCallback(
    async (email: string, password: string) => {
      const result = await auth.signIn(email, password);
      if (result.success && result.password) {
        setAuthPassword(result.password);
        setMode('cloud');
      }
    },
    [auth]
  );

  // Handle cloud sign up - pre-fill with local password if available
  const handleSignUp = useCallback(
    async (email: string, password: string) => {
      const result = await auth.signUp(email, password);
      if (result.success && result.password) {
        setAuthPassword(result.password);
        setMode('cloud');
      }
    },
    [auth]
  );

  // Switch to cloud mode (show auth form)
  const handleSwitchToCloud = useCallback(() => {
    setMode('cloud');
    setIsModeChoiceOpen(false);
  }, []);

  // Sign out and return to local mode
  const handleSignOut = useCallback(async () => {
    await auth.signOut();
    setMode('local');
    setAuthPassword(null);
  }, [auth]);

  // Note editor modal state
  const isVaultUnlocked = !isVaultLocked && isVaultReady;
  const isNoteModalOpen = view === 'note' && date !== null && isVaultUnlocked;
  const [showModalContent, setShowModalContent] = useState(false);
  const modalTimerRef = useRef<number | null>(null);

  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const handleCloseModal = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }

    setIsClosing(true);
    const hasLocalNote = noteDates.size > 0 || !isContentEmpty(content);
    const shouldPromptModeChoice = mode === 'local' && hasLocalNote && !hasShownModeChoiceRef.current;
    closeTimerRef.current = window.setTimeout(() => {
      setIsClosing(false);
      navigateToCalendar(year);
      if (shouldPromptModeChoice) {
        setPendingModeChoice(true);
      }
    }, 200);
  }, [content, mode, navigateToCalendar, noteDates.size, year]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);


  useEffect(() => {
    if (modalTimerRef.current !== null) {
      window.clearTimeout(modalTimerRef.current);
    }
    if (isNoteModalOpen) {
      modalTimerRef.current = window.setTimeout(() => {
        setShowModalContent(true);
      }, 100);
    } else {
      setShowModalContent(false);
    }
    return () => {
      if (modalTimerRef.current !== null) {
        window.clearTimeout(modalTimerRef.current);
        modalTimerRef.current = null;
      }
    };
  }, [isNoteModalOpen]);

  useEffect(() => {
    if (!pendingModeChoice || isNoteModalOpen) return;
    setIsModeChoiceOpen(true);
    setPendingModeChoice(false);
    hasShownModeChoiceRef.current = true;
    localStorage.setItem(CLOUD_PROMPT_KEY, '1');
  }, [pendingModeChoice, isNoteModalOpen]);

  useEffect(() => {
    if (mode === 'cloud' && isModeChoiceOpen) {
      setIsModeChoiceOpen(false);
    }
  }, [mode, isModeChoiceOpen]);

  useEffect(() => {
    if (mode !== 'cloud' || !repository || !vaultKey || !localVault.vaultKey || hasMigratedLocal) {
      return;
    }

    let cancelled = false;

    const migrateLocalNotes = async () => {
      try {
        const localRepository = createEncryptedNoteRepository(localVault.vaultKey);
        const localDates = await localRepository.getAllDates();
        if (!localDates.length) {
          if (!cancelled) {
            setHasMigratedLocal(true);
            localStorage.setItem(LOCAL_MIGRATION_KEY, '1');
          }
          return;
        }

        for (const localDate of localDates) {
          const note = await localRepository.get(localDate);
          if (note?.content) {
            await (repository as SyncedNoteRepository).saveWithMetadata({
              date: note.date,
              content: note.content,
              updatedAt: note.updatedAt,
              revision: 1,
              deleted: false
            });
          }
        }

        if (!cancelled) {
          setHasMigratedLocal(true);
          localStorage.setItem(LOCAL_MIGRATION_KEY, '1');
          triggerSync();
        }
      } catch (error) {
        console.error('Local migration error:', error);
      }
    };

    void migrateLocalNotes();

    return () => {
      cancelled = true;
    };
  }, [mode, repository, vaultKey, localVault.vaultKey, hasMigratedLocal, triggerSync]);

  // Determine what modal to show
  const showLocalVaultModal = mode === 'local' && isVaultLocked && localVault.isReady && localVault.requiresPassword;
  const isSigningIn = auth.authState === 'loading' ||
    (mode === 'cloud' && auth.authState === 'signed_in' && (!cloudVault.isReady || cloudVault.isBusy));
  const showCloudAuthModal = mode === 'cloud' && (
    auth.authState === 'signed_out' ||
    auth.authState === 'awaiting_confirmation' ||
    isSigningIn
  );

  return (
    <>
      {/* Calendar is always rendered as background */}
      <Calendar
        year={year}
        hasNote={hasNote}
        onDayClick={isVaultUnlocked ? navigateToDate : undefined}
        onYearChange={navigateToYear}
        syncStatus={mode === 'cloud' && isVaultUnlocked ? syncStatus : undefined}
        onSignIn={mode !== 'cloud' && auth.authState !== 'signed_in' ? handleSwitchToCloud : undefined}
        onSignOut={mode === 'cloud' && auth.authState === 'signed_in' ? handleSignOut : undefined}
      />

      {/* Cloud prompt modal - shown after the first local note is created */}
      <Modal isOpen={isModeChoiceOpen} onClose={() => {}} variant="overlay">
        <div className="vault-unlock">
          <div className="vault-unlock__card">
            <h2 className="vault-unlock__title">Sync your notes?</h2>
            <p className="vault-unlock__helper">
              Create an account to back up and sync across devices.
            </p>
            <div className="vault-unlock__choices">
              <button
                className="button button--primary vault-unlock__button"
                onClick={handleSwitchToCloud}
              >
                Sign in to sync
              </button>
              <button
                className="button button--ghost vault-unlock__button"
                onClick={() => setIsModeChoiceOpen(false)}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Local vault unlock modal */}
      <Modal isOpen={showLocalVaultModal} onClose={() => {}} variant="overlay">
        <VaultUnlock
          mode={localVault.hasVault ? 'unlock' : 'setup'}
          isBusy={localVault.isBusy}
          error={localVault.error}
          onUnlock={handleLocalUnlock}
          onSwitchToCloud={handleSwitchToCloud}
        />
      </Modal>

      {/* Cloud auth modal */}
      <Modal isOpen={showCloudAuthModal} onClose={() => {}} variant="overlay">
        {isSigningIn ? (
          <div className="vault-unlock">
            <div className="vault-unlock__card">
              <div className="note-loading">Signing in...</div>
            </div>
          </div>
        ) : auth.authState === 'awaiting_confirmation' ? (
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

      {/* Vault error modal */}
      <Modal isOpen={!!vaultError && isVaultReady} onClose={() => {}} variant="overlay">
        <div className="vault-unlock">
          <div className="vault-unlock__card">
            <h2 className="vault-unlock__title">Unlock Error</h2>
            <p className="vault-unlock__error">{vaultError}</p>
            <p className="vault-unlock__helper">
              Please try again.
            </p>
            {mode === 'cloud' && (
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

      {/* Note editor modal */}
      <Modal isOpen={isNoteModalOpen} onClose={handleCloseModal}>
        {date && showModalContent && (
          <NoteEditor
            date={date}
            content={isDecrypting ? '' : content}
            onChange={setContent}
            isClosing={isClosing}
            isDecrypting={isDecrypting}
          />
        )}
      </Modal>
    </>
  );
}

export default App;
