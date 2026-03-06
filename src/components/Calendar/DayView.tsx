import { useCallback, useState } from "react";
import { CalendarHeader } from "./CalendarHeader";
import { DayViewLayout } from "./DayViewLayout";
import { useMonthViewState } from "../../hooks/useMonthViewState";
import { useNoteKeyboardNav } from "../../hooks/useNoteKeyboardNav";
import type { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../domain/sync";
import { parseDate } from "../../utils/date";
import styles from "./Calendar.module.css";

interface DayViewProps {
  date: string;
  noteDates: Set<string>;
  hasNote: (date: string) => boolean;
  onDayClick: (date: string) => void;
  onYearChange: (year: number) => void;
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
  noteError?: Error | null;
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
  onYearChange,
  onMonthChange,
  onReturnToYear,
  content,
  onChange,
  hasEdits,
  isSaving,
  isDecrypting,
  isContentReady,
  isOfflineStub,
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

  return (
    <div
      className={styles.calendar}
      data-month-view="true"
      data-week-start-version={weekStartVersion}
    >
      <CalendarHeader
        year={year}
        month={month}
        hideNavOnMobile
        onYearChange={onYearChange}
        onMonthChange={onMonthChange}
        onReturnToYear={onReturnToYear}
        onLogoClick={onReturnToYear}
        syncStatus={syncStatus}
        syncError={syncError}
        pendingOps={pendingOps}
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
        now={now}
        content={content}
        onChange={onChange}
        hasEdits={hasEdits}
        isSaving={isSaving}
        isDecrypting={isDecrypting}
        isContentReady={isContentReady}
        isOfflineStub={isOfflineStub}
        noteError={noteError}
      />
    </div>
  );
}
