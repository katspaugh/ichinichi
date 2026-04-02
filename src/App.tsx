import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Calendar } from "./components/Calendar";
import { DayView } from "./components/Calendar/DayView";
import { AppLayout } from "./components/AppLayout";
import { Header } from "./components/Header";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { SettingsSidebar } from "./components/SettingsSidebar";
import { SearchOverlay } from "./components/Search";
import { exportNotesAsZip, downloadBlob } from "./services/exportNotes";
import { AboutModal } from "./components/AppModals/AboutModal";
import { PrivacyPolicyModal } from "./components/AppModals/PrivacyPolicyModal";
import { ResetPasswordModal } from "./components/AppModals/ResetPasswordModal";
import { AuthErrorModal } from "./components/AppModals/AuthErrorModal";
import { UnlockModal } from "./components/AppModals/UnlockModal";
import { AuthState } from "./hooks/useAuth";
import { AuthForm } from "./components/AuthForm";
import { IntroModal } from "./components/AppModals/IntroModal";
import { Modal } from "./components/Modal";
import { supabase } from "./lib/supabase";
import { generateSalt, deriveKEK, wrapDEK, saveKeyring } from "./crypto";
import { usePWA } from "./hooks/usePWA";
import { useAppController } from "./controllers/useAppController";
import { AuthProvider } from "./contexts/AuthProvider";
import { NoteRepositoryProvider } from "./contexts/NoteRepositoryProvider";
import { RoutingProvider } from "./contexts/RoutingProvider";
import { WeatherProvider } from "./contexts/WeatherProvider";
import { getTodayString, parseDate } from "./utils/date";
import calendarStyles from "./components/Calendar/Calendar.module.css";

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

function AppContent() {
  const { routing, auth, notes } = useAppController();
  const { needRefresh, updateServiceWorker, dismissUpdate } = usePWA();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [weekStartVersion, setWeekStartVersion] = useState(0);

  const { date, year, navigateToDate, navigateToYear, navigateToCalendar } =
    routing;

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

  const handleSearchClick = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
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

  const handleExport = useCallback(async () => {
    if (!notes.repository) return;
    const blob = await exportNotesAsZip(notes.repository);
    if (!blob) return;
    const today = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `ichinichi-export-${today}.zip`);
  }, [notes.repository]);

  const handleSyncClick = useCallback(() => {
    notes.triggerSync();
  }, [notes]);

  const signOutHandler =
    auth.authState === AuthState.SignedIn ? auth.signOut : undefined;

  const handleUpdatePassword = useCallback(
    async (password: string) => {
      const result = await auth.updatePassword(password);
      if (result.success && auth.user && auth.dek && auth.keyId) {
        // Re-wrap DEK with new password
        const salt = generateSalt();
        const kek = await deriveKEK(password, salt);
        const wrapped = await wrapDEK(auth.dek, kek);
        await saveKeyring(supabase, auth.user.id, {
          key_id: auth.keyId,
          wrapped_dek: wrapped.data,
          dek_iv: wrapped.iv,
          kdf_salt: salt,
          kdf_iterations: 600_000,
          is_primary: true,
        });
      }
      return result;
    },
    [auth],
  );

  const resetPasswordHandler =
    auth.authState === AuthState.SignedIn && auth.user?.email
      ? () => auth.resetPassword(auth.user!.email!)
      : undefined;

  // Cmd+K / Ctrl+K global shortcut to open search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("no-transition");
    });
  }, []);

  // Auth gate: loading state — render nothing visible but keep DOM non-empty
  // to avoid flash of unstyled content during Supabase session check
  if (auth.authState === AuthState.Loading) {
    return <div aria-busy="true" />;
  }

  // Auth gate: signed out — show calendar with intro or auth modal
  if (auth.authState === AuthState.SignedOut) {
    const showAuthForm = !routing.showIntro;
    return (
      <>
        <AppLayout
          header={
            <Header
              syncStatus="idle"
              isSaving={false}
            >
              <>
                <button
                  className={calendarStyles.navButton}
                  onClick={() => navigateToYear(year - 1)}
                  aria-label="Previous year"
                >
                  <ChevronLeft className={calendarStyles.navIcon} />
                </button>
                <span className={calendarStyles.year}>{year}</span>
                <button
                  className={calendarStyles.navButton}
                  onClick={() => navigateToYear(year + 1)}
                  aria-label="Next year"
                >
                  <ChevronRight className={calendarStyles.navIcon} />
                </button>
              </>
            </Header>
          }
        >
          <Calendar year={year} hasNote={() => false} />
        </AppLayout>

        <IntroModal
          isOpen={routing.showIntro}
          onGetStarted={routing.dismissIntro}
        />

        <Modal isOpen={showAuthForm} onClose={() => {}}>
          <AuthForm
            isBusy={auth.isBusy}
            error={auth.error}
            onSignIn={auth.signIn}
            onSignUp={auth.signUp}
            onResetPassword={(email) => { void auth.resetPassword(email); }}
          />
        </Modal>

        <ResetPasswordModal
          isOpen={auth.isPasswordRecovery}
          error={auth.error}
          onSubmit={handleUpdatePassword}
          onDismiss={auth.clearPasswordRecovery}
        />
        <AuthErrorModal
          isOpen={!!auth.hashError}
          error={auth.hashError}
          onClose={auth.clearHashError}
        />
      </>
    );
  }

  // Auth gate: DEK in progress (restoring from cache, unlocking, or generating) — show loading
  if (auth.isDekBusy) {
    return <div aria-busy="true" />;
  }

  // Auth gate: signed in but DEK not unlocked — show unlock prompt
  if (auth.dek === null) {
    return (
      <>
        <UnlockModal
          isOpen={true}
          error={auth.error}
          isBusy={auth.isBusy}
          onSubmit={auth.unlockDek}
          onSignOut={() => { void auth.signOut(); }}
        />
        <AuthErrorModal
          isOpen={!!auth.hashError}
          error={auth.hashError}
          onClose={auth.clearHashError}
        />
      </>
    );
  }

  const headerNav = isDayView ? null : (
    <>
      <button
        className={calendarStyles.navButton}
        onClick={() => navigateToYear(year - 1)}
        aria-label="Previous year"
      >
        <ChevronLeft className={calendarStyles.navIcon} />
      </button>
      <span className={calendarStyles.year}>{year}</span>
      <button
        className={calendarStyles.navButton}
        onClick={() => navigateToYear(year + 1)}
        aria-label="Next year"
      >
        <ChevronRight className={calendarStyles.navIcon} />
      </button>
    </>
  );

  return (
    <RoutingProvider value={routing}>
      <NoteRepositoryProvider value={notes}>
        <WeatherProvider>
          <ErrorBoundary
            fullScreen
            title="Ichinichi ran into a problem"
            description="Refresh the app to continue, or try again to recover."
            resetLabel="Reload app"
            onReset={() => window.location.reload()}
          >
            <AppLayout
              header={
                <Header
                  onLogoClick={isDayView ? handleReturnToYear : undefined}
                  syncStatus={notes.syncStatus}
                  isSaving={notes.isSaving}
                  onMenuClick={handleMenuClick}
                  onSearchClick={handleSearchClick}
                  onSyncClick={handleSyncClick}
                >
                  {headerNav}
                </Header>
              }
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
                  noteError={notes.noteError}
                />
              ) : (
                <Calendar
                  weekStartVersion={weekStartVersion}
                  year={year}
                  hasNote={notes.hasNote}
                  onDayClick={navigateToDate}
                  onMonthClick={handleCalendarMonthClick}
                />
              )}
            </AppLayout>

            <SearchOverlay
              open={searchOpen}
              onClose={handleSearchClose}
              onSelectDate={navigateToDate}
              repository={notes.repository}
              noteDates={notes.noteDates}
            />

            <SettingsSidebar
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              userEmail={auth.user?.email}
              isSignedIn={auth.authState === AuthState.SignedIn}
              onSignOut={signOutHandler}
              onResetPassword={resetPasswordHandler}
              commitHash={commitHash}
              onOpenAbout={handleOpenAbout}
              onOpenPrivacy={handleOpenPrivacy}
              onWeekStartChange={handleWeekStartChange}
              onExport={notes.repository ? handleExport : undefined}
              dek={auth.dek}
              keyId={auth.keyId}
              userId={auth.user?.id}
            />

            <AboutModal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
            <PrivacyPolicyModal
              isOpen={privacyOpen}
              onClose={() => setPrivacyOpen(false)}
            />
            <ResetPasswordModal
              isOpen={auth.isPasswordRecovery}
              error={auth.error}
              onSubmit={handleUpdatePassword}
              onDismiss={auth.clearPasswordRecovery}
            />
            <AuthErrorModal
              isOpen={!!auth.hashError}
              error={auth.hashError}
              onClose={auth.clearHashError}
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
    </RoutingProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
