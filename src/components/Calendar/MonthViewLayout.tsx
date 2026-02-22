import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { NavigationArrow } from "../NavigationArrow";
import { NoteEditor } from "../NoteEditor";
import { MonthGrid } from "./MonthGrid";
import type { HabitValues } from "../../types";
import styles from "./MonthViewLayout.module.css";

const BLUR_INACTIVITY_MS = 2 * 60 * 1000; // 2 minutes

interface MonthViewLayoutProps {
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
  habits?: HabitValues;
  onHabitChange?: (habits: HabitValues) => void;
}

function usePrivacyBlur() {
  const [isBlurred, setIsBlurred] = useState(true);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      setIsBlurred(true);
    }, BLUR_INACTIVITY_MS);
  }, []);

  const handleActivity = useCallback(() => {
    setIsBlurred(false);
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  // Set up click listener for unblurring
  useEffect(() => {
    const events = ["click", "touchstart"];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Start the inactivity timer
    resetInactivityTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [handleActivity, resetInactivityTimer]);

  return { isBlurred, resetBlur: useCallback(() => setIsBlurred(true), []) };
}

export function MonthViewLayout({
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
  habits,
  onHabitChange,
}: MonthViewLayoutProps) {
  const { isBlurred, resetBlur } = usePrivacyBlur();

  // Reset blur when clicking a different day
  const handleDayClick = useCallback(
    (date: string) => {
      resetBlur();
      onDayClick(date);
    },
    [onDayClick, resetBlur],
  );

  return (
    <div className={styles.layout}>
      <div className={styles.monthGridPane}>
        <div className={styles.monthGridWrap}>
          <MonthGrid
            year={year}
            month={month}
            hasNote={hasNote}
            onDayClick={handleDayClick}
            showMonthView={true}
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
              isBlurred={isBlurred}
              habits={habits}
              onHabitChange={onHabitChange}
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
