import { useEffect, useRef } from 'react';
import { formatDateDisplay } from '../../utils/date';
import { canEditNote } from '../../utils/noteRules';
import { NoteEditorView } from './NoteEditorView';
import { useContentEditableEditor } from './useContentEditableEditor';
import { useSavingIndicator } from './useSavingIndicator';
import { useInlineImageUpload, useInlineImageUrls } from './useInlineImages';
import { useImageDragState } from './useImageDragState';

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

  const {
    editorRef,
    handleInput,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleClick
  } = useContentEditableEditor({
    content,
    isEditable,
    placeholderText,
    onChange,
    onUserInput: scheduleSavingIndicator,
    onImageDrop,
    onDropComplete: endImageDrag
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
      const el = editorRef.current;
      if (!el) return;
      if (document.activeElement === el) {
        lastFocusedDateRef.current = date;
        return;
      }
      if (typeof el.focus === 'function') {
        el.focus({ preventScroll: true });
      }
      if (document.activeElement === el) {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      if (document.activeElement === el) {
        lastFocusedDateRef.current = date;
      }
    };
    const frame = requestAnimationFrame(() => {
      focusEditor();
    });
    const retryTimer = window.setTimeout(() => {
      focusEditor();
    }, 120);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(retryTimer);
    };
  }, [date, isEditable, editorRef]);

  useInlineImageUrls({
    date,
    content,
    editorRef
  });

  return (
    <NoteEditorView
      formattedDate={formattedDate}
      isEditable={isEditable}
      showReadonlyBadge={!canEdit}
      statusText={statusText}
      placeholderText={placeholderText}
      editorRef={editorRef}
      onInput={handleInput}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={handleClick}
      isDraggingImage={isDraggingImage}
    />
  );
}
