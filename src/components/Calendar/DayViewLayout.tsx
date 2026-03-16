import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { ErrorBoundary } from "../ErrorBoundary";
import { NavigationArrow } from "../NavigationArrow";
import { NoteEditor } from "../NoteEditor";
import { MonthGrid } from "./MonthGrid";
import { useOverscrollNavigation } from "../../hooks/useOverscrollNavigation";
import { useKeyboardInset } from "../../hooks/useKeyboardInset";
import { getMonthName } from "../../utils/date";

import styles from "./DayViewLayout.module.css";

interface DayViewLayoutProps {
  year: number;
  month: number;
  hasNote: (date: string) => boolean;
  selectedDate: string | null;
  onDayClick: (date: string) => void;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onWeekStartChange?: () => void;
  onMonthChange: (year: number, month: number) => void;
  onReturnToYear: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  now?: Date;
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
}

export function DayViewLayout({
  year,
  month,
  hasNote,
  selectedDate,
  onDayClick,
  canNavigatePrev,
  canNavigateNext,
  onNavigatePrev,
  onNavigateNext,
  onWeekStartChange,
  onMonthChange,
  onReturnToYear,
  sidebarCollapsed,
  onToggleSidebar,
  now,
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
}: DayViewLayoutProps) {
  const [layoutEl, setLayoutEl] = useState<HTMLDivElement | null>(null);
  useKeyboardInset();

  useOverscrollNavigation(layoutEl, {
    onOverscrollUp: canNavigatePrev ? onNavigatePrev : undefined,
    onOverscrollDown: canNavigateNext ? onNavigateNext : undefined,
  });

  const handlePrevMonth = () => {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    onMonthChange(prevYear, prevMonth);
  };

  const handleNextMonth = () => {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    onMonthChange(nextYear, nextMonth);
  };

  return (
    <div
      className={styles.layout}
      ref={setLayoutEl}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
    >
      {!sidebarCollapsed && (
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <button
              className={styles.sidebarNavButton}
              onClick={handlePrevMonth}
              aria-label="Previous month"
            >
              <ChevronLeft className={styles.sidebarNavIcon} />
            </button>
            <button
              className={styles.monthLabel}
              onClick={onReturnToYear}
              aria-label="Return to year view"
            >
              {year}, {getMonthName(month)}
            </button>
            <button
              className={styles.sidebarNavButton}
              onClick={handleNextMonth}
              aria-label="Next month"
            >
              <ChevronRight className={styles.sidebarNavIcon} />
            </button>
            <button
              className={styles.sidebarNavButton}
              onClick={onToggleSidebar}
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className={styles.sidebarNavIcon} />
            </button>
          </div>

          <div className={styles.monthGridWrap}>
            <MonthGrid
              year={year}
              month={month}
              hasNote={hasNote}
              onDayClick={onDayClick}
              isDetailView
              selectedDate={selectedDate}
              onWeekStartChange={onWeekStartChange}
              now={now}
            />
          </div>

          <div className={styles.monthNav} aria-label="Note navigation">
            <NavigationArrow
              direction="left"
              onClick={onNavigatePrev}
              disabled={!canNavigatePrev}
              ariaLabel="Previous note"
            />
            <NavigationArrow
              direction="right"
              onClick={onNavigateNext}
              disabled={!canNavigateNext}
              ariaLabel="Next note"
            />
          </div>
        </div>
      )}

      {sidebarCollapsed && (
        <button
          className={styles.expandButton}
          onClick={onToggleSidebar}
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen className={styles.sidebarNavIcon} />
        </button>
      )}

      <div className={styles.editorPane}>
        {selectedDate ? (
          <ErrorBoundary
            title="Note editor crashed"
            description="You can select another date or refresh the page."
            resetLabel="Reload editor"
          >
            <NoteEditor
              date={selectedDate}
              content={isContentReady ? content : ""}
              onChange={onChange}
              isClosing={false}
              hasEdits={hasEdits}
              isSaving={isSaving}
              isDecrypting={isDecrypting}
              isContentReady={isContentReady}
              isOfflineStub={isOfflineStub}
              isSoftDeleted={isSoftDeleted}
              onRestore={onRestore}
              error={noteError}
            />
          </ErrorBoundary>
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              Select a day to view or edit a note
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
