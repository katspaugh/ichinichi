import { useCallback } from "react";
import type { DragEvent } from "react";
import type { HabitValues } from "../../types";
import { formatDateDisplay } from "../../utils/date";
import { canEditNote } from "../../utils/noteRules";
import { NoteEditorView } from "./NoteEditorView";
import { useContentEditableEditor } from "./useContentEditableEditor";
import { useSavingIndicator } from "./useSavingIndicator";
import { useInlineImageUpload, useInlineImageUrls } from "./useInlineImages";
import { useImageDragState } from "./useImageDragState";
import { useDropIndicator } from "./useDropIndicator";
import { LocationPrompt } from "../LocationPrompt/LocationPrompt";
import { useWeatherContext } from "../../contexts/weatherContext";
import { HabitTracker } from "../../features/habits/HabitTracker";
import { useHabitDefinitions } from "../../features/habits/useHabitDefinitions";

interface NoteEditorProps {
  date: string;
  content: string;
  onChange: (content: string) => void;
  isClosing: boolean;
  hasEdits: boolean;
  /** True when the note is being saved (dirty or saving state) */
  isSaving: boolean;
  isDecrypting?: boolean;
  isContentReady: boolean;
  isOfflineStub?: boolean;
  /** True when note content should be blurred for privacy */
  isBlurred?: boolean;
  habits?: HabitValues;
  onHabitChange?: (habits: HabitValues) => void;
}

export function NoteEditor({
  date,
  content,
  onChange,
  isClosing,
  hasEdits,
  isSaving,
  isDecrypting = false,
  isContentReady,
  isOfflineStub = false,
  isBlurred = false,
  habits,
  onHabitChange,
}: NoteEditorProps) {
  const canEdit = canEditNote(date);
  const isEditable = canEdit && !isDecrypting && isContentReady;
  const formattedDate = formatDateDisplay(date);
  const { showSaving, scheduleSavingIndicator } = useSavingIndicator(
    isEditable,
    isSaving,
  );

  // Show "Saving..." when:
  // - The useSavingIndicator hook says to show it (handles idle timer + minimum display), OR
  // - We're closing the modal and still have unsaved changes (hasEdits or isSaving)
  const shouldShowSaving = showSaving || (isClosing && (isSaving || hasEdits));
  const statusText = isDecrypting
    ? "Decrypting..."
    : shouldShowSaving
      ? "Saving..."
      : null;
  const placeholderText =
    !isContentReady || isDecrypting
      ? "Loading..."
      : isOfflineStub
        ? "This note can't be loaded while offline. Go online to view it."
        : isEditable
          ? "Write your note for today..."
          : "No note for this day";

  const { isDraggingImage, endImageDrag } = useImageDragState();
  const weather = useWeatherContext();
  const { state: weatherState } = weather;

  const { onImageDrop } = useInlineImageUpload({
    date,
    isEditable,
  });

  const handleWeatherClick = useCallback(
    (hr: HTMLHRElement) => {
      weather.requestPreciseForHr(hr);
    },
    [weather],
  );

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
    onWeatherClick: handleWeatherClick,
    showWeather: weatherState.showWeather,
    applyWeatherToEditor: weather.applyWeatherToEditor,
    clearWeatherFromEditor: weather.clearWeatherFromEditor,
    hasWeather: weather.hasWeather,
  });

  const handleLocationConfirm = useCallback(async () => {
    const applied = await weather.confirmPreciseForHr();
    if (applied && editorRef.current) {
      // Save content directly without triggering full input processing
      // (which would insert a new timestamp HR)
      onChange(editorRef.current.innerHTML);
    }
    return applied;
  }, [editorRef, onChange, weather]);

  const handleLocationDeny = useCallback(() => {
    weather.dismissPrecisePrompt();
  }, [weather]);

  const { indicatorPosition, updateIndicator, clearIndicator } =
    useDropIndicator({
      editorRef,
      isEditable,
      isDraggingImage,
    });

  const handleDragOverWithIndicator = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      handleDragOver(event);
      updateIndicator(event);
    },
    [handleDragOver, updateIndicator],
  );

  const handleDropWithIndicator = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      clearIndicator();
      handleDrop(event);
    },
    [clearIndicator, handleDrop],
  );

  useInlineImageUrls({
    date,
    content,
    editorRef,
  });

  const { definitions, addHabit, renameHabit, updateType: handleUpdateType } =
    useHabitDefinitions(habits, onHabitChange);

  const handleHabitChange = useCallback(
    (newValues: HabitValues) => {
      onHabitChange?.(newValues);
    },
    [onHabitChange],
  );

  const habitFooter =
    (definitions.length > 0 || isEditable) && isContentReady ? (
      <HabitTracker
        definitions={definitions}
        values={habits}
        onChange={handleHabitChange}
        isEditable={isEditable}
        onAddHabit={addHabit}
        onRenameHabit={renameHabit}
        onUpdateType={handleUpdateType}
      />
    ) : null;

  return (
    <>
      <NoteEditorView
        formattedDate={formattedDate}
        isEditable={isEditable}
        showReadonlyBadge={!canEdit}
        statusText={statusText}
        placeholderText={placeholderText}
        editorRef={editorRef}
        onInput={handleInput}
        onPaste={handlePaste}
        onDrop={handleDropWithIndicator}
        onDragOver={handleDragOverWithIndicator}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        isDraggingImage={isDraggingImage}
        dropIndicatorPosition={indicatorPosition}
        isBlurred={isBlurred}
        footer={habitFooter}
      />
      <LocationPrompt
        isOpen={weatherState.isPromptOpen}
        onConfirm={handleLocationConfirm}
        onDeny={handleLocationDeny}
      />
    </>
  );
}
