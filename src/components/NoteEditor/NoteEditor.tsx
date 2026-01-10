import { formatDateDisplay } from "../../utils/date";
import { canEditNote } from "../../utils/noteRules";
import { NoteEditorView } from "./NoteEditorView";
import { useContentEditableEditor } from "./useContentEditableEditor";
import { useSavingIndicator } from "./useSavingIndicator";
import { useInlineImageUpload, useInlineImageUrls } from "./useInlineImages";
import { useImageDragState } from "./useImageDragState";

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
  isContentReady,
}: NoteEditorProps) {
  const canEdit = canEditNote(date);
  const isEditable = canEdit && !isDecrypting && isContentReady;
  const formattedDate = formatDateDisplay(date);
  const { showSaving, scheduleSavingIndicator } =
    useSavingIndicator(isEditable);

  const shouldShowSaving = isEditable && hasEdits && (showSaving || isClosing);
  const statusText = isDecrypting
    ? "Decrypting..."
    : shouldShowSaving
      ? "Saving..."
      : null;
  const placeholderText =
    !isContentReady || isDecrypting
      ? "Loading..."
      : isEditable
        ? "Write your note for today..."
        : "No note for this day";

  const { isDraggingImage, endImageDrag } = useImageDragState();

  const { onImageDrop } = useInlineImageUpload({
    date,
    isEditable,
  });

  const {
    editorRef,
    handleInput,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleClick,
    handleKeyDown,
  } = useContentEditableEditor({
    content,
    isEditable,
    placeholderText,
    onChange,
    onUserInput: scheduleSavingIndicator,
    onImageDrop,
    onDropComplete: endImageDrag,
  });

  useInlineImageUrls({
    date,
    content,
    editorRef,
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
      onKeyDown={handleKeyDown}
      isDraggingImage={isDraggingImage}
    />
  );
}
