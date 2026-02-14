import type { Editor } from "@tiptap/core";
import { NoteEditorHeader } from "./NoteEditorHeader";
import { NoteEditorContent } from "./NoteEditorContent";
import styles from "./NoteEditor.module.css";

interface NoteEditorViewProps {
  formattedDate: string;
  showReadonlyBadge: boolean;
  statusText: string | null;
  editor: Editor | null;
  isDraggingImage?: boolean;
  isBlurred?: boolean;
}

export function NoteEditorView({
  formattedDate,
  showReadonlyBadge,
  statusText,
  editor,
  isDraggingImage = false,
  isBlurred = false,
}: NoteEditorViewProps) {
  const bodyClassName = `${styles.body} ${isBlurred ? styles.blurred : ""}`;

  return (
    <div className={styles.editor}>
      {isDraggingImage && (
        <div className={styles.dragOverlay} aria-hidden="true"></div>
      )}
      <NoteEditorHeader
        formattedDate={formattedDate}
        showReadonlyBadge={showReadonlyBadge}
        statusText={statusText}
      />
      <div className={bodyClassName}>
        <NoteEditorContent editor={editor} />
      </div>
    </div>
  );
}
