import { parseDate } from "../../utils/date";
import { getMoonPhaseEmoji, getMoonPhaseName } from "../../utils/moonPhase";
import styles from "./NoteEditor.module.css";

interface NoteEditorHeaderProps {
  date: string;
  formattedDate: string;
  showReadonlyBadge: boolean;
  onJumpToToday?: () => void;
  statusText: string | null;
  isStatusError?: boolean;
  onRestore?: () => void;
  weatherLabel?: string | null;
  debugKeyId?: string | null;
}

export function NoteEditorHeader({
  date,
  formattedDate,
  showReadonlyBadge,
  onJumpToToday,
  statusText,
  isStatusError = false,
  onRestore,
  weatherLabel,
  debugKeyId,
}: NoteEditorHeaderProps) {
  const parsed = parseDate(date);
  const moonEmoji = parsed ? getMoonPhaseEmoji(parsed) : "";
  const moonTitle = parsed ? getMoonPhaseName(parsed) : "";

  return (
    <div className={styles.header}>
      <div className={styles.headerTitle}>
        <span className={styles.date}>
          {moonEmoji && <><span className={styles.moonEmoji} title={moonTitle}>{moonEmoji}</span> </>}
          {formattedDate}
        </span>
        {weatherLabel && (
          <span className={styles.weatherLabel}>
            {weatherLabel}
          </span>
        )}
        {showReadonlyBadge && (
          <span className={styles.readonlyBadge}>Read only</span>
        )}
        {showReadonlyBadge && onJumpToToday && (
          <button
            type="button"
            className={styles.jumpToTodayButton}
            onClick={onJumpToToday}
            title="Jump to today's note"
          >
            Jump to today
          </button>
        )}
        {debugKeyId && (
          <code className={styles.debugKeyBadge} title={debugKeyId}>
            {debugKeyId.slice(0, 8)}
          </code>
        )}
      </div>
      {statusText && (
        <span
          className={[
            styles.status,
            isStatusError ? styles.statusError : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-live="polite"
        >
          {statusText}
          {onRestore && (
            <button
              className={styles.restoreButton}
              onClick={onRestore}
            >
              Restore
            </button>
          )}
        </span>
      )}
    </div>
  );
}
