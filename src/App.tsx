import { useCallback } from "react";
import { Calendar } from "./components/Calendar";
import { MonthView } from "./components/Calendar/MonthView";
import { AppModals } from "./components/AppModals";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { AuthState } from "./hooks/useAuth";
import { AppMode } from "./hooks/useAppMode";
import { usePWA } from "./hooks/usePWA";
import { useAppController } from "./controllers/useAppController";
import { AppModeProvider } from "./contexts/AppModeProvider";
import { ActiveVaultProvider } from "./contexts/ActiveVaultProvider";
import { NoteRepositoryProvider } from "./contexts/NoteRepositoryProvider";
import { UrlStateProvider } from "./contexts/UrlStateProvider";
import { useMonthViewState } from "./hooks/useMonthViewState";

import "./styles/theme.css";
import "./styles/reset.css";

function App() {
  const { urlState, auth, appMode, activeVault, notes } = useAppController();
  const { needRefresh, updateServiceWorker, dismissUpdate } = usePWA();
  const {
    year,
    month,
    monthDate,
    navigateToDate,
    navigateToYear,
    navigateToMonth,
    navigateToMonthDate,
    navigateToCalendar,
  } = urlState;

  const canSync = notes.capabilities.canSync;
  const isMonthView = month !== null;

  // Use month view state hook for auto-selection when in month view
  useMonthViewState({
    enabled: isMonthView,
    year,
    month: month ?? 0,
    monthDate,
    noteDates: notes.noteDates,
    navigateToMonthDate,
  });

  const handleMonthChange = useCallback(
    (year: number, month: number) => {
      navigateToMonth(year, month);
    },
    [navigateToMonth],
  );

  const handleReturnToYear = useCallback(() => {
    navigateToCalendar(year);
  }, [navigateToCalendar, year]);

  // Common props for sign in/out
  const signInHandler =
    appMode.mode !== AppMode.Cloud && auth.authState !== AuthState.SignedIn
      ? appMode.switchToCloud
      : undefined;
  const signOutHandler =
    appMode.mode === AppMode.Cloud && auth.authState === AuthState.SignedIn
      ? activeVault.handleSignOut
      : undefined;

  return (
    <UrlStateProvider value={urlState}>
      <AppModeProvider value={appMode}>
        <ActiveVaultProvider value={activeVault}>
          <NoteRepositoryProvider value={notes}>
            <ErrorBoundary
              fullScreen
              title="DailyNote ran into a problem"
              description="Refresh the app to continue, or try again to recover."
              resetLabel="Reload app"
              onReset={() => window.location.reload()}
            >
              {/* Render MonthView with split layout when in month view, otherwise regular Calendar */}
              {isMonthView ? (
                <MonthView
                  year={year}
                  month={month}
                  monthDate={monthDate}
                  hasNote={notes.hasNote}
                  onDayClick={
                    activeVault.isVaultUnlocked ? navigateToMonthDate : () => {}
                  }
                  onYearChange={navigateToYear}
                  onMonthChange={handleMonthChange}
                  onReturnToYear={handleReturnToYear}
                  content={notes.content}
                  onChange={notes.setContent}
                  hasEdits={notes.hasEdits}
                  isSaving={notes.isSaving}
                  isDecrypting={notes.isDecrypting}
                  isContentReady={notes.isContentReady}
                  isOfflineStub={notes.isOfflineStub}
                  syncStatus={canSync ? notes.syncStatus : undefined}
                  syncError={canSync ? notes.syncError : undefined}
                  pendingOps={canSync ? notes.pendingOps : undefined}
                  onSignIn={signInHandler}
                  onSignOut={signOutHandler}
                />
              ) : (
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
                  syncError={canSync ? notes.syncError : undefined}
                  pendingOps={canSync ? notes.pendingOps : undefined}
                  onSignIn={signInHandler}
                  onSignOut={signOutHandler}
                />
              )}

              <AppModals />

              {needRefresh && (
                <UpdatePrompt
                  onUpdate={updateServiceWorker}
                  onDismiss={dismissUpdate}
                />
              )}
            </ErrorBoundary>
          </NoteRepositoryProvider>
        </ActiveVaultProvider>
      </AppModeProvider>
    </UrlStateProvider>
  );
}

export default App;
