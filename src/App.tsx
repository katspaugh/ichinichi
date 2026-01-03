import { Calendar } from './components/Calendar';
import { AppModals } from './components/AppModals';
import { AuthState } from './hooks/useAuth';
import { AppMode } from './hooks/useAppMode';
import { useAppController } from './controllers/useAppController';
import { AppModeProvider } from './contexts/AppModeProvider';
import { ActiveVaultProvider } from './contexts/ActiveVaultProvider';
import { NoteRepositoryProvider } from './contexts/NoteRepositoryProvider';
import { UrlStateProvider } from './contexts/UrlStateProvider';

import './styles/theme.css';
import './styles/reset.css';
import './styles/components.css';
import './styles/prosemirror.css';

function App() {
  const { urlState, auth, appMode, activeVault, notes } = useAppController();
  const { year, navigateToDate, navigateToYear } = urlState;

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
