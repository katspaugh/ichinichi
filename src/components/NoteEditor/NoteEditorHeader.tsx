import { useCallback, useRef } from "react";
import type { ChangeEvent } from "react";
import { ImagePlus } from "lucide-react";
import styles from "./NoteEditor.module.css";

interface NoteEditorHeaderProps {
  formattedDate: string;
  showReadonlyBadge: boolean;
  statusText: string | null;
  onClose?: () => void;
  onImageSelect?: (file: File) => void;
}

export function NoteEditorHeader({
  formattedDate,
  showReadonlyBadge,
  statusText,
  onImageSelect,
}: NoteEditorHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file && onImageSelect) {
        onImageSelect(file);
      }
      // Reset so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onImageSelect],
  );

  return (
    <div className={styles.header}>
      <div className={styles.headerTitle}>
        <span className={styles.date}>{formattedDate}</span>
        {showReadonlyBadge && (
          <span className={styles.readonlyBadge}>Read only</span>
        )}
        {onImageSelect && (
          <>
            <button
              type="button"
              className={styles.imageButton}
              onClick={handleButtonClick}
              aria-label="Insert image"
              title="Insert image"
            >
              <ImagePlus size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className={styles.imageInput}
              onChange={handleFileChange}
            />
          </>
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
