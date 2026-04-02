import { useCallback, useState } from "react";
import { DayViewLayout } from "./DayViewLayout";
import { useMonthViewState } from "../../hooks/useMonthViewState";
import { useNoteKeyboardNav } from "../../hooks/useNoteKeyboardNav";
import { parseDate } from "../../utils/date";
import { SIDEBAR_COLLAPSED_KEY } from "../../utils/constants";
import styles from "./DayView.module.css";

interface DayViewProps {
  date: string;
  noteDates: Set<string>;
  hasNote: (date: string) => boolean;
  onDayClick: (date: string) => void;
  onMonthChange: (year: number, month: number) => void;
  onReturnToYear: () => void;
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
      className={styles.root}
      data-week-start-version={weekStartVersion}
    >
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
