import { useCallback, useEffect, useState } from "react";
import { Calendar } from "./components/Calendar";
import { DayView } from "./components/Calendar/DayView";
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
import { RoutingProvider } from "./contexts/RoutingProvider";
import { WeatherProvider } from "./contexts/WeatherProvider";
import { getTodayString, parseDate } from "./utils/date";

function getLatestNoteInMonth(
  noteDates: Set<string>,
  year: number,
  month: number,
): string | null {
  const notesInMonth: string[] = [];

  for (const dateStr of noteDates) {
    const parsed = parseDate(dateStr);
    if (parsed && parsed.getFullYear() === year && parsed.getMonth() === month) {
      notesInMonth.push(dateStr);
    }
  }

  notesInMonth.sort((a, b) => {
    const dateA = parseDate(a);
    const dateB = parseDate(b);
    if (!dateA || !dateB) return 0;
    return dateA.getTime() - dateB.getTime();
  });

  return notesInMonth.at(-1) ?? null;
}

function App() {
  const { routing, auth, appMode, activeVault, notes } = useAppController();
  const { needRefresh, updateServiceWorker, dismissUpdate } = usePWA();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [weekStartVersion, setWeekStartVersion] = useState(0);

  const { date, year, navigateToDate, navigateToYear, navigateToCalendar } =
    routing;

  const canSync = notes.capabilities.canSync;
  const isDayView = date !== null;
  const commitHash = __COMMIT_HASH__;

  const handleReturnToYear = useCallback(() => {
    navigateToCalendar(year);
  }, [navigateToCalendar, year]);

  const handleCalendarMonthClick = useCallback(
    (targetYear: number, targetMonth: number) => {
      const latestNote = getLatestNoteInMonth(
        notes.noteDates,
        targetYear,
        targetMonth,
      );
      if (!latestNote) return;
      navigateToDate(latestNote);
    },
    [notes.noteDates, navigateToDate],
  );

  const handleDayViewMonthChange = useCallback(
    (targetYear: number, targetMonth: number) => {
      const now = new Date();
      const isCurrentMonth =
        targetYear === now.getFullYear() && targetMonth === now.getMonth();

      if (isCurrentMonth) {
        navigateToDate(getTodayString());
        return;
      }

      const latestNote = getLatestNoteInMonth(
        notes.noteDates,
        targetYear,
        targetMonth,
      );
      if (!latestNote) return;
      navigateToDate(latestNote);
    },
    [notes.noteDates, navigateToDate],
  );

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

  const signInHandler =
    appMode.mode !== AppMode.Cloud && auth.authState !== AuthState.SignedIn
      ? appMode.switchToCloud
      : undefined;

  const handleSyncClick = useCallback(() => {
    notes.triggerSync({ immediate: true });
  }, [notes]);

  const signOutHandler =
    appMode.mode === AppMode.Cloud && auth.authState === AuthState.SignedIn
      ? activeVault.handleSignOut
      : undefined;

  useEffect(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("no-transition");
    });
  }, []);

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
    <RoutingProvider value={routing}>
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
                {isDayView && date ? (
                  <DayView
                    weekStartVersion={weekStartVersion}
                    date={date}
                    noteDates={notes.noteDates}
                    hasNote={notes.hasNote}
                    onDayClick={navigateToDate}
                    onMonthChange={handleDayViewMonthChange}
                    onReturnToYear={handleReturnToYear}
                    content={notes.content}
                    onChange={notes.setContent}
                    hasEdits={notes.hasEdits}
                    isSaving={notes.isSaving}
                    isDecrypting={notes.isDecrypting}
                    isContentReady={notes.isContentReady}
                    isOfflineStub={notes.isOfflineStub}
                    isSoftDeleted={notes.isSoftDeleted}
                    onRestore={notes.restoreNote}
                    noteError={notes.noteError}
                    syncStatus={canSync ? notes.syncStatus : undefined}
                    syncError={canSync ? notes.syncError : undefined}
                    pendingOps={canSync ? notes.pendingOps : undefined}
                    onMenuClick={handleMenuClick}
                    onSignIn={signInHandler}
                    onSyncClick={canSync ? handleSyncClick : undefined}
                  />
                ) : (
                  <Calendar
                    weekStartVersion={weekStartVersion}
                    year={year}
                    hasNote={notes.hasNote}
                    onDayClick={navigateToDate}
                    onYearChange={navigateToYear}
                    onMonthClick={handleCalendarMonthClick}
                    syncStatus={canSync ? notes.syncStatus : undefined}
                    syncError={canSync ? notes.syncError : undefined}
                    pendingOps={canSync ? notes.pendingOps : undefined}
                    onMenuClick={handleMenuClick}
                    onSignIn={signInHandler}
                    onSyncClick={canSync ? handleSyncClick : undefined}
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
    </RoutingProvider>
  );
}

export default App;
