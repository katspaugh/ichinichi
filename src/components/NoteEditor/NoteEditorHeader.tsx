import { parseDate } from "../../utils/date";
import { getMoonPhaseEmoji, getMoonPhaseName } from "../../utils/moonPhase";
import styles from "./NoteEditor.module.css";

interface NoteEditorHeaderProps {
  date: string;
  formattedDate: string;
  showReadonlyBadge: boolean;
  statusText: string | null;
  isStatusError?: boolean;
  onClose?: () => void;
}

export function NoteEditorHeader({
  date,
  formattedDate,
  showReadonlyBadge,
  statusText,
  isStatusError = false,
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
        {showReadonlyBadge && (
          <span className={styles.readonlyBadge}>Read only</span>
        )}
      </div>
      <span
        className={[
          styles.saving,
          statusText ? styles.savingVisible : "",
          isStatusError ? styles.savingError : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-live="polite"
      >
        {statusText ?? ""}
      </span>
    </div>
  );
}
