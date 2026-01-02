import { Calendar } from './components/Calendar';
import { AppModals } from './components/AppModals';
import { useUrlState } from './hooks/useUrlState';
import { AuthState, useAuth } from './hooks/useAuth';
import { AppMode, useAppMode } from './hooks/useAppMode';
import { useActiveVault } from './hooks/useActiveVault';
import { useNoteRepository } from './hooks/useNoteRepository';
import { AppModeProvider } from './contexts/AppModeProvider';
import { ActiveVaultProvider } from './contexts/ActiveVaultProvider';
import { NoteRepositoryProvider } from './contexts/NoteRepositoryProvider';
import { UrlStateProvider } from './contexts/UrlStateProvider';

import './styles/theme.css';
import './styles/reset.css';
import './styles/components.css';

function App() {
  const urlState = useUrlState();
  const { date, year, navigateToDate, navigateToYear } = urlState;
  const auth = useAuth();
  const appMode = useAppMode({ authState: auth.authState });
  const activeVault = useActiveVault({
    auth,
    mode: appMode.mode,
    setMode: appMode.setMode
  });
  const notes = useNoteRepository({
    mode: appMode.mode,
    authUser: auth.user,
    vaultKey: activeVault.vaultKey,
    keyring: activeVault.keyring,
    activeKeyId: activeVault.activeKeyId,
    date,
    year
  });

  const canSync = notes.capabilities.canSync;

  return (
    <UrlStateProvider value={urlState}>
      <AppModeProvider value={appMode}>
        <ActiveVaultProvider value={activeVault}>
          <NoteRepositoryProvider value={notes}>
            <>
              {/* Calendar is always rendered as background */}
              <Calendar
                year={year}
                hasNote={notes.hasNote}
                onDayClick={activeVault.isVaultUnlocked ? navigateToDate : undefined}
                onYearChange={navigateToYear}
                syncStatus={canSync ? notes.syncStatus : undefined}
                pendingOps={canSync ? notes.pendingOps : undefined}
                onSignIn={appMode.mode !== AppMode.Cloud && auth.authState !== AuthState.SignedIn ? appMode.switchToCloud : undefined}
                onSignOut={appMode.mode === AppMode.Cloud && auth.authState === AuthState.SignedIn ? activeVault.handleSignOut : undefined}
              />

              <AppModals />
            </>
          </NoteRepositoryProvider>
        </ActiveVaultProvider>
      </AppModeProvider>
    </UrlStateProvider>
  );
}

export default App;
