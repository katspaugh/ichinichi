import { useCallback, useEffect, useMemo } from "react";
import type { DragEvent } from "react";
import { formatDateDisplay, getTodayString, isToday } from "../../utils/date";
import { canEditNote } from "../../utils/noteRules";
import { useRoutingContext } from "../../contexts/routingContext";
import { getPlaceholderText } from "../../utils/placeholderText";
import { NoteEditorView } from "./NoteEditorView";
import { useContentEditableEditor } from "./useContentEditableEditor";
import { useInlineImageUpload, useInlineImageUrls } from "./useInlineImages";
import { useImageDragState } from "./useImageDragState";
import { useDropIndicator } from "./useDropIndicator";
import { useShareTarget } from "../../hooks/useShareTarget";
import { useWeatherContext } from "../../contexts/weatherContext";
import { useNoteRepositoryContext } from "../../contexts/noteRepositoryContext";
import type { SavedWeather } from "../../types";
import type { DailyWeatherData } from "../../domain/weather/WeatherRepository";
import { useDebugNoteKeyId } from "../../hooks/useDebugNoteKeyId";

interface NoteEditorProps {
  date: string;
  content: string;
  onChange: (content: string) => void;
  isClosing: boolean;
  hasEdits: boolean;
  isSaving: boolean;
  isDecrypting?: boolean;
  isContentReady: boolean;
  isOfflineStub?: boolean;
  isSoftDeleted?: boolean;
  onRestore?: () => void;
  error?: { type: string; message: string } | null;
}

export function NoteEditor({
  date,
  content,
  onChange,
  isDecrypting = false,
  isContentReady,
  isOfflineStub = false,
  isSoftDeleted = false,
  onRestore,
  error,
}: NoteEditorProps) {
  const canEdit = canEditNote(date);
  const isEditable = canEdit && !isDecrypting && isContentReady && !isSoftDeleted;
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const autoFocus = isEditable && !(isMobile && content.trim().length > 0);
  const formattedDate = formatDateDisplay(date);

  const hasError = !!error;
  const statusText = hasError
    ? "Unable to decrypt note"
    : isSoftDeleted
      ? "This note was deleted"
      : isDecrypting
        ? "Decrypting..."
        : null;
  const placeholderText = getPlaceholderText({
    isContentReady,
    isDecrypting,
    isOfflineStub,
    isEditable,
    date,
  });

  const debugKeyId = useDebugNoteKeyId(date, isContentReady);

  const { navigateToDate } = useRoutingContext();
  const handleJumpToToday = useCallback(() => {
    navigateToDate(getTodayString());
  }, [navigateToDate]);

  const { isDraggingImage, endImageDrag } = useImageDragState();
  const weather = useWeatherContext();
  const { state: weatherState } = weather;

  // Stored weather from note document via RxDB
  const { weather: storedWeather, setWeather: setNoteWeather } = useNoteRepositoryContext();

  // Push live weather into note for today's notes so it gets persisted
  const liveWeather = weatherState.dailyWeather;
  useEffect(() => {
    if (!isToday(date) || !weatherState.showWeather || !liveWeather) return;
    const saved: SavedWeather = {
      icon: liveWeather.icon,
      temperatureHigh: liveWeather.temperatureHigh,
      temperatureLow: liveWeather.temperatureLow,
      unit: liveWeather.unit,
      city: liveWeather.city,
    };
    setNoteWeather(saved);
  }, [date, liveWeather, weatherState.showWeather, setNoteWeather]);

  // Display: live weather for today, stored weather for past notes
  const displayWeather: DailyWeatherData | null = useMemo(() => {
    if (!weatherState.showWeather) return null;
    if (isToday(date) && liveWeather) return liveWeather;
    if (storedWeather) {
      return { ...storedWeather, timestamp: 0 };
    }
    return null;
  }, [date, liveWeather, storedWeather, weatherState.showWeather]);

  const weatherLabel = useMemo(() => {
    if (!displayWeather) return null;
    return weather.formatWeatherLabel(displayWeather);
  }, [displayWeather, weather]);

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
    handleFileInput,
  } = useContentEditableEditor({
    content,
    isEditable,
    placeholderText,
    onChange,
    onImageDrop,
    onDropComplete: endImageDrag,
    showWeather: weatherState.showWeather,
    clearWeatherFromEditor: weather.clearWeatherFromEditor,
  });

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

  // Auto-insert images shared via Web Share Target API
  useShareTarget(onImageDrop ? handleFileInput : undefined, isEditable);

  return (
    <NoteEditorView
      date={date}
      formattedDate={formattedDate}
      isEditable={isEditable}
      autoFocus={autoFocus}
      showReadonlyBadge={!canEdit}
      onJumpToToday={!canEdit ? handleJumpToToday : undefined}
      statusText={statusText}
      isStatusError={hasError}
      onRestore={isSoftDeleted ? onRestore : undefined}
      placeholderText={placeholderText}
      editorRef={editorRef}
      onInput={handleInput}
      onPaste={handlePaste}
      onDrop={handleDropWithIndicator}
      onDragOver={handleDragOverWithIndicator}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onImageSelect={onImageDrop ? handleFileInput : undefined}
      isDraggingImage={isDraggingImage}
      dropIndicatorPosition={indicatorPosition}
      footer={null}
      weatherLabel={weatherLabel}
      debugKeyId={debugKeyId}
    />
  );
}
