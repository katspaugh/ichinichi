import { useEffect } from "react";
import type {
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  RefObject,
} from "react";
import styles from "./NoteEditor.module.css";

interface NoteEditorContentProps {
  editorRef: RefObject<HTMLDivElement | null>;
  isEditable: boolean;
  autoFocus: boolean;
  placeholderText: string;
  onInput?: (event: FormEvent<HTMLDivElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export function NoteEditorContent({
  editorRef,
  isEditable,
  autoFocus,
  placeholderText,
  onInput,
  onPaste,
  onDrop,
  onDragOver,
  onClick,
  onKeyDown,
}: NoteEditorContentProps) {
  useEffect(() => {
    if (autoFocus) {
      editorRef.current?.focus({ preventScroll: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={editorRef}
      className={[
        styles.content,
        isEditable ? styles.contentEditable : styles.contentReadonly,
      ]
        .filter(Boolean)
        .join(" ")}
      data-placeholder={placeholderText}
      data-note-editor="content"
      contentEditable={isEditable}
      tabIndex={isEditable ? 0 : -1}
      suppressContentEditableWarning={true}
      role="textbox"
      aria-multiline="true"
      aria-readonly={!isEditable}
      onInput={onInput}
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onClick={onClick}
      onKeyDown={onKeyDown}
    />
  );
}
