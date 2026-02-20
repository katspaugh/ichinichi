import styles from "./NoteEditor.module.css";

interface NoteEditorHeaderProps {
  formattedDate: string;
  showReadonlyBadge: boolean;
  statusText: string | null;
  onClose?: () => void;
}

export function NoteEditorHeader({
  formattedDate,
  showReadonlyBadge,
  statusText,
}: NoteEditorHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.headerTitle}>
        <span className={styles.date}>{formattedDate}</span>
        {showReadonlyBadge && (
          <span className={styles.readonlyBadge}>Read only</span>
        )}
        <span
          className={[styles.saving, statusText ? styles.savingVisible : ""]
            .filter(Boolean)
            .join(" ")}
          aria-live="polite"
        >
          {statusText ?? ""}
        </span>
      </div>
    </div>
  );
}
