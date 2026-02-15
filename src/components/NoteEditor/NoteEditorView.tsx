import type {
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
} from "react";
import { NoteEditorHeader } from "./NoteEditorHeader";
import { NoteEditorContent } from "./NoteEditorContent";
import type { DropIndicatorPosition } from "./useDropIndicator";
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
  dropIndicatorPosition?: DropIndicatorPosition | null;
  isBlurred?: boolean;
  footer?: ReactNode;
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
  dropIndicatorPosition,
  isBlurred = false,
  footer,
}: NoteEditorViewProps) {
  const bodyClassName = `${styles.body} ${isBlurred ? styles.blurred : ""}`;

  return (
    <div className={styles.editor}>
      {isDraggingImage && (
        <div className={styles.dragOverlay} aria-hidden="true"></div>
      )}
      {dropIndicatorPosition && (
        <div
          className={styles.dropIndicator}
          style={{
            top: dropIndicatorPosition.top,
            left: dropIndicatorPosition.left,
            width: dropIndicatorPosition.width,
          }}
          aria-hidden="true"
        />
      )}
      <NoteEditorHeader
        formattedDate={formattedDate}
        showReadonlyBadge={showReadonlyBadge}
        statusText={statusText}
      />
      <div className={bodyClassName}>
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
      {footer}
    </div>
  );
}
