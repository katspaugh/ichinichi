import { useState } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { NavigationArrow } from "../NavigationArrow";
import { NoteEditor } from "../NoteEditor";
import { MonthGrid } from "./MonthGrid";
import { useOverscrollNavigation } from "../../hooks/useOverscrollNavigation";
import { useKeyboardInset } from "../../hooks/useKeyboardInset";

import styles from "./DayViewLayout.module.css";

interface DayViewLayoutProps {
  // Month grid props
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
  now?: Date;
  // Editor props
  content: string;
  onChange: (content: string) => void;
  hasEdits: boolean;
  isSaving: boolean;
  isDecrypting: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
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
  now,
  content,
  onChange,
  hasEdits,
  isSaving,
  isDecrypting,
  isContentReady,
  isOfflineStub,
  noteError,
}: DayViewLayoutProps) {
  const [layoutEl, setLayoutEl] = useState<HTMLDivElement | null>(null);
  useKeyboardInset();

  useOverscrollNavigation(layoutEl, {
    onOverscrollUp: canNavigatePrev ? onNavigatePrev : undefined,
    onOverscrollDown: canNavigateNext ? onNavigateNext : undefined,
  });

  return (
    <div className={styles.layout} ref={setLayoutEl}>
      <div className={styles.monthGridPane}>
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
