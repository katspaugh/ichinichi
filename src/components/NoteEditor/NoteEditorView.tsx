import type { ClipboardEvent, DragEvent, FormEvent, RefObject } from 'react';

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
  isDraggingImage = false
}: NoteEditorViewProps) {
  return (
    <div className="note-editor">
      {isDraggingImage && (
        <div className="note-editor__drag-overlay" aria-hidden="true">
        </div>
      )}
      <div className="note-editor__header">
        <div className="note-editor__header-title">
          <span className="note-editor__date">{formattedDate}</span>
          {showReadonlyBadge && (
            <span className="note-editor__readonly-badge">Read only</span>
          )}
        </div>
        {statusText && (
          <span className="note-editor__saving">{statusText}</span>
        )}
      </div>
      <div className="note-editor__body">
        <div
          ref={editorRef}
          className={`note-editor__content${!isEditable ? ' note-editor__content--readonly' : ''}`}
          data-placeholder={placeholderText}
          contentEditable={isEditable}
          suppressContentEditableWarning={true}
          role="textbox"
          aria-multiline="true"
          aria-readonly={!isEditable}
          onInput={onInput}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={onDragOver}
        />
      </div>
    </div>
  );
}
