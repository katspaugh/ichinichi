import { useCallback, useEffect, useState } from "react";
import { Calendar } from "./components/Calendar";
import { MonthView } from "./components/Calendar/MonthView";
import { AppModals } from "./components/AppModals";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { SettingsSidebar } from "./components/SettingsSidebar";
import { AboutModal } from "./components/AppModals/AboutModal";
import { PrivacyPolicyModal } from "./components/AppModals/PrivacyPolicyModal";
import { AuthState } from "./hooks/useAuth";
import { AppMode } from "./hooks/useAppMode";
import { usePWA } from "./hooks/usePWA";
import { useAppController } from "./controllers/useAppController";
import { AppModeProvider } from "./contexts/AppModeProvider";
import { ActiveVaultProvider } from "./contexts/ActiveVaultProvider";
import { NoteRepositoryProvider } from "./contexts/NoteRepositoryProvider";
import { UrlStateProvider } from "./contexts/UrlStateProvider";
import { useMonthViewState } from "./hooks/useMonthViewState";
import { WeatherProvider } from "./contexts/WeatherProvider";


function App() {
  const { urlState, auth, appMode, activeVault, notes } = useAppController();
  const { needRefresh, updateServiceWorker, dismissUpdate } = usePWA();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [weekStartVersion, setWeekStartVersion] = useState(0);
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
  const commitHash = __COMMIT_HASH__;

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

  const handleMenuClick = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleOpenAbout = useCallback(() => {
    setSettingsOpen(false);
    setAboutOpen(true);
  }, []);

  const handleOpenPrivacy = useCallback(() => {
    setSettingsOpen(false);
    setPrivacyOpen(true);
  }, []);

  const handleWeekStartChange = useCallback(() => {
    setWeekStartVersion((value) => value + 1);
  }, []);

  // Sign in handler for header
  const signInHandler =
    appMode.mode !== AppMode.Cloud && auth.authState !== AuthState.SignedIn
      ? appMode.switchToCloud
      : undefined;

  // Sign out handler for settings sidebar
  const signOutHandler =
    appMode.mode === AppMode.Cloud && auth.authState === AuthState.SignedIn
      ? activeVault.handleSignOut
      : undefined;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.dataset.vaultUnlocked = String(activeVault.isVaultUnlocked);
    root.dataset.vaultLocked = String(activeVault.isVaultLocked);
    root.dataset.vaultReady = String(activeVault.isVaultReady);
    root.dataset.vaultHasPassword = String(!!activeVault.authPassword);
  }, [
    activeVault.isVaultUnlocked,
    activeVault.isVaultLocked,
    activeVault.isVaultReady,
    activeVault.authPassword,
  ]);

  return (
    <UrlStateProvider value={urlState}>
      <AppModeProvider value={appMode}>
        <ActiveVaultProvider value={activeVault}>
          <NoteRepositoryProvider value={notes}>
            <WeatherProvider>
              <ErrorBoundary
                fullScreen
                title="Ichinichi ran into a problem"
                description="Refresh the app to continue, or try again to recover."
                resetLabel="Reload app"
                onReset={() => window.location.reload()}
              >
                {/* Render MonthView with split layout when in month view, otherwise regular Calendar */}
                {isMonthView ? (
                  <MonthView
                    weekStartVersion={weekStartVersion}
                    year={year}
                    month={month}
                    monthDate={monthDate}
                    noteDates={notes.noteDates}
                    hasNote={notes.hasNote}
                    onDayClick={
                      activeVault.isVaultUnlocked
                        ? navigateToMonthDate
                        : () => {}
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
                    onMenuClick={handleMenuClick}
                    onSignIn={signInHandler}
                  />
                ) : (
                  <Calendar
                    weekStartVersion={weekStartVersion}
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
                    onMenuClick={handleMenuClick}
                    onSignIn={signInHandler}
                  />
                )}

                <SettingsSidebar
                  open={settingsOpen}
                  onOpenChange={setSettingsOpen}
                  userEmail={auth.user?.email}
                  isSignedIn={auth.authState === AuthState.SignedIn}
                  onSignIn={signInHandler}
                  onSignOut={signOutHandler}
                  commitHash={commitHash}
                  onOpenAbout={handleOpenAbout}
                  onOpenPrivacy={handleOpenPrivacy}
                  onWeekStartChange={handleWeekStartChange}
                />

                <AppModals />
                <AboutModal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
                <PrivacyPolicyModal
                  isOpen={privacyOpen}
                  onClose={() => setPrivacyOpen(false)}
                />

                {needRefresh && (
                  <UpdatePrompt
                    onUpdate={updateServiceWorker}
                    onDismiss={dismissUpdate}
                  />
                )}
              </ErrorBoundary>
            </WeatherProvider>
          </NoteRepositoryProvider>
        </ActiveVaultProvider>
      </AppModeProvider>
    </UrlStateProvider>
  );
}

export default App;
