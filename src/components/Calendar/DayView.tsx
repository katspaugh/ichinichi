import { useCallback, useState } from "react";
import { Header } from "../Header";
import { DayViewLayout } from "./DayViewLayout";
import { useMonthViewState } from "../../hooks/useMonthViewState";
import { useNoteKeyboardNav } from "../../hooks/useNoteKeyboardNav";
import type { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../domain/sync";
import { parseDate } from "../../utils/date";
import { SIDEBAR_COLLAPSED_KEY } from "../../utils/constants";
import styles from "./Calendar.module.css";

interface DayViewProps {
  date: string;
  noteDates: Set<string>;
  hasNote: (date: string) => boolean;
  onDayClick: (date: string) => void;
  onMonthChange: (year: number, month: number) => void;
  onReturnToYear: () => void;
  // Editor props
  content: string;
  onChange: (content: string) => void;
  hasEdits: boolean;
  isSaving: boolean;
  isDecrypting: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
  isSoftDeleted?: boolean;
  onRestore?: () => void;
  noteError?: { type: string; message: string } | null;
  // Sync props
  syncStatus?: SyncStatus;
  syncError?: string | null;
  pendingOps?: PendingOpsSummary;
  onMenuClick?: () => void;
  onSignIn?: () => void;
  onSyncClick?: () => void;
  now?: Date;
  weekStartVersion?: number;
}

export function DayView({
  date,
  noteDates,
  hasNote,
  onDayClick,
  onMonthChange,
  onReturnToYear,
  content,
  onChange,
  hasEdits,
  isSaving,
  isDecrypting,
  isContentReady,
  isOfflineStub,
  isSoftDeleted,
  onRestore,
  noteError,
  syncStatus,
  syncError,
  pendingOps,
  onMenuClick,
  onSignIn,
  onSyncClick,
  now,
  weekStartVersion,
}: DayViewProps) {
  const [, setWeekStartVersion] = useState(0);
  const parsedDate = parseDate(date);

  if (!parsedDate) {
    throw new Error(`DayView requires valid date, got: ${date}`);
  }

  const year = parsedDate.getFullYear();
  const month = parsedDate.getMonth();

  const {
    canSelectPrevious,
    canSelectNext,
    selectPreviousNote,
    selectNextNote,
  } = useMonthViewState({
    date,
    noteDates,
    navigateToDate: onDayClick,
  });

  useNoteKeyboardNav({
    enabled: !isDecrypting,
    onPrevious: selectPreviousNote,
    onNext: selectNextNote,
    contentEditableSelector: '[data-note-editor="content"]',
  });

  const handleWeekStartChange = useCallback(() => {
    setWeekStartVersion((value) => value + 1);
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"
  );

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  return (
    <div
      className={styles.calendar}
      data-month-view="true"
      data-week-start-version={weekStartVersion}
    >
      <Header
        hideNavOnMobile
        onLogoClick={onReturnToYear}
        syncStatus={syncStatus}
        syncError={syncError}
        pendingOps={pendingOps}
        isSaving={isSaving}
        onMenuClick={onMenuClick}
        onSignIn={onSignIn}
        onSyncClick={onSyncClick}
      />
      <DayViewLayout
        year={year}
        month={month}
        hasNote={hasNote}
        selectedDate={date}
        onDayClick={onDayClick}
        canNavigatePrev={canSelectPrevious}
        canNavigateNext={canSelectNext}
        onNavigatePrev={selectPreviousNote}
        onNavigateNext={selectNextNote}
        onWeekStartChange={handleWeekStartChange}
        onMonthChange={onMonthChange}
        onReturnToYear={onReturnToYear}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={handleToggleSidebar}
        now={now}
        content={content}
        onChange={onChange}
        hasEdits={hasEdits}
        isSaving={isSaving}
        isDecrypting={isDecrypting}
        isContentReady={isContentReady}
        isOfflineStub={isOfflineStub}
        isSoftDeleted={isSoftDeleted}
        onRestore={onRestore}
        noteError={noteError}
      />
    </div>
  );
}
