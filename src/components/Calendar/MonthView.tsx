import { useCallback, useState } from "react";
import { CalendarHeader } from "./CalendarHeader";
import { MonthViewLayout } from "./MonthViewLayout";
import { useNoteNavigation } from "../../hooks/useNoteNavigation";
import { useNoteKeyboardNav } from "../../hooks/useNoteKeyboardNav";
import type { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../domain/sync";
import styles from "./Calendar.module.css";

interface MonthViewProps {
  year: number;
  month: number;
  monthDate: string | null;
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
  // Sync props
  syncStatus?: SyncStatus;
  syncError?: string | null;
  pendingOps?: PendingOpsSummary;
  onSignIn?: () => void;
  onSignOut?: () => void;
  now?: Date;
}

export function MonthView({
  year,
  month,
  monthDate,
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
  syncStatus,
  syncError,
  pendingOps,
  onSignIn,
  onSignOut,
  now,
}: MonthViewProps) {
  const [, setWeekStartVersion] = useState(0);
  const commitHash = __COMMIT_HASH__;
  const commitUrl = `https://github.com/katspaugh/dailynote/commit/${commitHash}`;

  // Keyboard navigation for notes (arrow left/right)
  const { navigateToPrevious, navigateToNext } = useNoteNavigation({
    currentDate: monthDate,
    noteDates,
    onNavigate: onDayClick,
  });

  useNoteKeyboardNav({
    enabled: monthDate !== null && !isDecrypting,
    onPrevious: navigateToPrevious,
    onNext: navigateToNext,
    contentEditableSelector: '[data-note-editor="content"]',
  });

  const handleWeekStartChange = useCallback(() => {
    setWeekStartVersion((value) => value + 1);
  }, []);

  return (
    <div className={styles.calendar} data-month-view="true">
      <CalendarHeader
        year={year}
        month={month}
        commitHash={commitHash}
        commitUrl={commitUrl}
        onYearChange={onYearChange}
        onMonthChange={onMonthChange}
        onReturnToYear={onReturnToYear}
        syncStatus={syncStatus}
        syncError={syncError}
        pendingOps={pendingOps}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />
      <MonthViewLayout
        year={year}
        month={month}
        hasNote={hasNote}
        selectedDate={monthDate}
        onDayClick={onDayClick}
        onWeekStartChange={handleWeekStartChange}
        now={now}
        content={content}
        onChange={onChange}
        hasEdits={hasEdits}
        isSaving={isSaving}
        isDecrypting={isDecrypting}
        isContentReady={isContentReady}
        isOfflineStub={isOfflineStub}
      />
    </div>
  );
}
