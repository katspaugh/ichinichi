import { useCallback } from "react";
import { Calendar } from "./components/Calendar";
import { AppModals } from "./components/AppModals";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { AuthState } from "./hooks/useAuth";
import { AppMode } from "./hooks/useAppMode";
import { usePWA } from "./hooks/usePWA";
import { useAppController } from "./controllers/useAppController";
import { AppModeProvider } from "./contexts/AppModeProvider";
import { ActiveVaultProvider } from "./contexts/ActiveVaultProvider";
import { NoteRepositoryProvider } from "./contexts/NoteRepositoryProvider";
import { UrlStateProvider } from "./contexts/UrlStateProvider";

import "./styles/theme.css";
import "./styles/reset.css";

function App() {
  const { urlState, auth, appMode, activeVault, notes } = useAppController();
  const { needRefresh, updateServiceWorker, dismissUpdate } = usePWA();
  const {
    year,
    month,
    navigateToDate,
    navigateToYear,
    navigateToMonth,
    navigateToCalendar,
  } = urlState;

  const canSync = notes.capabilities.canSync;

  const handleMonthChange = useCallback(
    (year: number, month: number) => {
      navigateToMonth(year, month);
    },
    [navigateToMonth],
  );

  const handleReturnToYear = useCallback(() => {
    navigateToCalendar(year);
  }, [navigateToCalendar, year]);

  return (
    <UrlStateProvider value={urlState}>
      <AppModeProvider value={appMode}>
        <ActiveVaultProvider value={activeVault}>
          <NoteRepositoryProvider value={notes}>
            <>
              {/* Calendar is always rendered as background */}
              <Calendar
                year={year}
                month={month}
                hasNote={notes.hasNote}
                onDayClick={
                  activeVault.isVaultUnlocked ? navigateToDate : undefined
                }
                onYearChange={navigateToYear}
                onMonthChange={handleMonthChange}
                onReturnToYear={handleReturnToYear}
                syncStatus={canSync ? notes.syncStatus : undefined}
                pendingOps={canSync ? notes.pendingOps : undefined}
                onSignIn={
                  appMode.mode !== AppMode.Cloud &&
                  auth.authState !== AuthState.SignedIn
                    ? appMode.switchToCloud
                    : undefined
                }
                onSignOut={
                  appMode.mode === AppMode.Cloud &&
                  auth.authState === AuthState.SignedIn
                    ? activeVault.handleSignOut
                    : undefined
                }
              />

              <AppModals />

              {needRefresh && (
                <UpdatePrompt
                  onUpdate={updateServiceWorker}
                  onDismiss={dismissUpdate}
                />
              )}
            </>
          </NoteRepositoryProvider>
        </ActiveVaultProvider>
      </AppModeProvider>
    </UrlStateProvider>
  );
}

export default App;
