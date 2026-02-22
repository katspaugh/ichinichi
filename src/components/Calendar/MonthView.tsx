import { useCallback, useState } from "react";
import { CalendarHeader } from "./CalendarHeader";
import { MonthViewLayout } from "./MonthViewLayout";
import { useNoteNavigation } from "../../hooks/useNoteNavigation";
import { useNoteKeyboardNav } from "../../hooks/useNoteKeyboardNav";
import type { SyncStatus, HabitValues } from "../../types";
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
  habits?: HabitValues;
  onHabitChange?: (habits: HabitValues) => void;
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
  habits,
  onHabitChange,
  syncStatus,
  syncError,
  pendingOps,
  onMenuClick,
  onSignIn,
  onSyncClick,
  now,
  weekStartVersion,
}: MonthViewProps) {
  const [, setWeekStartVersion] = useState(0);

  // Keyboard navigation for notes (arrow left/right)
  const {
    canNavigatePrev,
    canNavigateNext,
    navigateToPrevious,
    navigateToNext,
  } = useNoteNavigation({
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
    <div
      className={styles.calendar}
      data-month-view="true"
      data-week-start-version={weekStartVersion}
    >
      <CalendarHeader
        year={year}
        month={month}
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
      <MonthViewLayout
        year={year}
        month={month}
        hasNote={hasNote}
        selectedDate={monthDate}
        onDayClick={onDayClick}
        canNavigatePrev={canNavigatePrev}
        canNavigateNext={canNavigateNext}
        onNavigatePrev={navigateToPrevious}
        onNavigateNext={navigateToNext}
        onWeekStartChange={handleWeekStartChange}
        now={now}
        content={content}
        onChange={onChange}
        hasEdits={hasEdits}
        isSaving={isSaving}
        isDecrypting={isDecrypting}
        isContentReady={isContentReady}
        isOfflineStub={isOfflineStub}
        habits={habits}
        onHabitChange={onHabitChange}
      />
    </div>
  );
}
