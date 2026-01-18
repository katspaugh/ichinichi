import { ErrorBoundary } from "../ErrorBoundary";
import { NoteEditor } from "../NoteEditor";
import { MonthGrid } from "./MonthGrid";
import styles from "./MonthViewLayout.module.css";

interface MonthViewLayoutProps {
  // Month grid props
  year: number;
  month: number;
  hasNote: (date: string) => boolean;
  selectedDate: string | null;
  onDayClick: (date: string) => void;
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
}

export function MonthViewLayout({
  year,
  month,
  hasNote,
  selectedDate,
  onDayClick,
  onWeekStartChange,
  now,
  content,
  onChange,
  hasEdits,
  isSaving,
  isDecrypting,
  isContentReady,
  isOfflineStub,
}: MonthViewLayoutProps) {
  return (
    <div className={styles.layout}>
      <div className={styles.monthGridPane}>
        <MonthGrid
          year={year}
          month={month}
          hasNote={hasNote}
          onDayClick={onDayClick}
          showMonthView={true}
          selectedDate={selectedDate}
          onWeekStartChange={onWeekStartChange}
          now={now}
        />
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
