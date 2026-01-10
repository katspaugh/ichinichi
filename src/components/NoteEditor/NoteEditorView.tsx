import type {
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  RefObject,
} from "react";
import { NoteEditorHeader } from "./NoteEditorHeader";
import { NoteEditorContent } from "./NoteEditorContent";
import styles from "./NoteEditor.module.css";

interface NoteEditorViewProps {
  formattedDate: string;
  isEditable: boolean;
  showReadonlyBadge: boolean;
  statusText: string | null;
  placeholderText: string;
  editorRef: RefObject<HTMLDivElement | null>;
  onInput?: (event: FormEvent<HTMLDivElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  isDraggingImage?: boolean;
}

export function NoteEditorView({
  formattedDate,
  isEditable,
  showReadonlyBadge,
  statusText,
  placeholderText,
  editorRef,
  onInput,
  onPaste,
  onDrop,
  onDragOver,
  onClick,
  onKeyDown,
  isDraggingImage = false,
}: NoteEditorViewProps) {
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
      <div className={styles.body}>
        <NoteEditorContent
          editorRef={editorRef}
          isEditable={isEditable}
          placeholderText={placeholderText}
          onInput={onInput}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onClick={onClick}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
