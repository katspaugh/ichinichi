import { useEffect, useMemo, useRef } from 'react';
import { formatDateDisplay } from '../../utils/date';
import { canEditNote } from '../../utils/noteRules';
import { useSavingIndicator } from './useSavingIndicator';
import { useInlineImageUpload } from './useInlineImages';
import { useImageDragState } from './useImageDragState';
import { useProseMirror } from '../../editor/useProseMirror';
import { useNoteRepositoryContext } from '../../contexts/noteRepositoryContext';
import { ImageUrlManager } from '../../utils/imageUrlManager';

interface NoteEditorProps {
  date: string;
  content: string;
  onChange: (content: string) => void;
  isClosing: boolean;
  hasEdits: boolean;
  isDecrypting?: boolean;
  isContentReady: boolean;
}

export function NoteEditor({
  date,
  content,
  onChange,
  isClosing,
  hasEdits,
  isDecrypting = false,
  isContentReady
}: NoteEditorProps) {
  const canEdit = canEditNote(date);
  const isEditable = canEdit && !isDecrypting && isContentReady;
  const formattedDate = formatDateDisplay(date);
  const { showSaving, scheduleSavingIndicator } = useSavingIndicator(isEditable);
  const { imageRepository } = useNoteRepositoryContext();

  const shouldShowSaving = isEditable && hasEdits && (showSaving || isClosing);
  const statusText = isDecrypting
    ? 'Decrypting...'
    : shouldShowSaving
      ? 'Saving...'
      : null;
  const placeholderText = !isContentReady || isDecrypting
    ? 'Loading...'
    : isEditable
      ? 'Write your note for today...'
      : 'No note for this day';

  const { isDraggingImage, endImageDrag } = useImageDragState();

  const { onImageDrop } = useInlineImageUpload({
    date,
    isEditable
  });

  // Create ImageUrlManager instance
  const imageUrlManager = useMemo(() => {
    if (imageRepository) {
      return new ImageUrlManager(imageRepository);
    }
    return undefined;
  }, [imageRepository]);

  const { editorRef, focus } = useProseMirror({
    content,
    isEditable,
    placeholderText,
    onChange,
    onUserInput: scheduleSavingIndicator,
    onImageDrop,
    onDropComplete: endImageDrag,
    imageUrlManager
  });

  const lastFocusedDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isEditable) {
      lastFocusedDateRef.current = null;
    }
  }, [isEditable]);

  useEffect(() => {
    if (!isEditable) return;
    if (lastFocusedDateRef.current === date) return;
    
    const focusEditor = () => {
      if (lastFocusedDateRef.current === date) return;
      focus();
      lastFocusedDateRef.current = date;
    };
    
    const frame = requestAnimationFrame(focusEditor);
    const retryTimer = window.setTimeout(focusEditor, 120);
    
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(retryTimer);
    };
  }, [date, isEditable, focus]);

  return (
    <div className="note-editor">
      {isDraggingImage && (
        <div className="note-editor__drag-overlay" aria-hidden="true">
        </div>
      )}
      <div className="note-editor__header">
        <div className="note-editor__header-title">
          <span className="note-editor__date">{formattedDate}</span>
          {!canEdit && (
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
          className={`note-editor__content ProseMirror-container${!isEditable ? ' note-editor__content--readonly' : ''}`}
          role="textbox"
          aria-multiline="true"
          aria-readonly={!isEditable}
        />
      </div>
    </div>
  );
}
