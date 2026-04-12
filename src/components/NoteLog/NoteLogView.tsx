import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ChangeEvent } from "react";
import { Check, ImagePlus } from "lucide-react";
import {
  parseNoteSegments,
  assembleSegments,
} from "../../utils/noteSegments";
import { applyTextTransforms } from "../../services/editorTextTransforms";
import { getTimestampLabel } from "../../services/timestampLabel";
import { formatDateDisplay, isToday } from "../../utils/date";
import { useWeatherContext } from "../../contexts/weatherContext";
import { useNoteRepositoryContext } from "../../contexts/noteRepositoryContext";
import {
  useInlineImageUpload,
  useInlineImageUrls,
} from "../NoteEditor/useInlineImages";
import { NoteEditorHeader } from "../NoteEditor/NoteEditorHeader";
import { useDebugNoteKeyId } from "../../hooks/useDebugNoteKeyId";
import { LogEntry } from "./LogEntry";
import contentStyles from "../../styles/noteContent.module.css";
import styles from "./NoteLogView.module.css";
import type { DailyWeatherData } from "../../domain/weather/WeatherRepository";

const AUTO_SAVE_MS = 10 * 60 * 1000;

interface NoteLogViewProps {
  date: string;
  content: string;
  onChange: (content: string) => void;
  isContentReady: boolean;
  isDecrypting?: boolean;
}

function serializeContent(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const node of clone.querySelectorAll("[class]")) {
    node.removeAttribute("class");
  }
  for (const img of clone.querySelectorAll("img[data-image-id]")) {
    img.removeAttribute("src");
  }
  for (const node of clone.querySelectorAll("[style]")) {
    node.removeAttribute("style");
  }
  return clone.innerHTML;
}

function createTimestampHrHtml(): string {
  const timestamp = new Date().toISOString();
  const label = getTimestampLabel(timestamp);
  const labelAttr = label ? ` data-label="${label}"` : "";
  return `<hr data-timestamp="${timestamp}"${labelAttr} contenteditable="false">`;
}

function insertNodeAtCursor(node: Node) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAtEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function NoteLogView({
  date,
  content,
  onChange,
  isContentReady,
  isDecrypting = false,
}: NoteLogViewProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Header: date, weather, debug key
  const formattedDate = formatDateDisplay(date);
  const debugKeyId = useDebugNoteKeyId(date, isContentReady);
  const weather = useWeatherContext();
  const { state: weatherState } = weather;
  const { weather: storedWeather } = useNoteRepositoryContext();
  const liveWeather = weatherState.dailyWeather;

  const displayWeather: DailyWeatherData | null = useMemo(() => {
    if (!weatherState.showWeather) return null;
    if (isToday(date) && liveWeather) return liveWeather;
    if (storedWeather) return { ...storedWeather, timestamp: 0 };
    return null;
  }, [date, liveWeather, storedWeather, weatherState.showWeather]);

  const weatherLabel = useMemo(() => {
    if (!displayWeather) return null;
    return weather.formatWeatherLabel(displayWeather);
  }, [displayWeather, weather]);

  // Image upload
  const { onImageDrop } = useInlineImageUpload({ date, isEditable: true });

  useInlineImageUrls({ date, content, editorRef: containerRef });

  const segments = useMemo(() => {
    if (!isContentReady || isDecrypting) return [];
    return parseNoteSegments(content);
  }, [content, isContentReady, isDecrypting]);

  // Reverse for newest-first display
  const displaySegments = useMemo(() => [...segments].reverse(), [segments]);

  const hasEditorContent = useCallback(() => {
    const el = editorRef.current;
    if (!el) return false;
    const text = (el.textContent ?? "").trim();
    return text.length > 0 || el.querySelector("img") !== null;
  }, []);

  const saveCard = useCallback(() => {
    const el = editorRef.current;
    if (!el || !hasEditorContent()) return;

    const hrHtml = createTimestampHrHtml();
    const entryHtml = serializeContent(el);
    onChange(content + hrHtml + entryHtml);

    // Clear editor
    el.textContent = "";
    el.focus();

    // Clear auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, [content, onChange, hasEditorContent]);

  const resetAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      saveCard();
    }, AUTO_SAVE_MS);
  }, [saveCard]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    applyTextTransforms(el);
    if (hasEditorContent()) {
      resetAutoSaveTimer();
    }
  }, [hasEditorContent, resetAutoSaveTimer]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        saveCard();
      }
    },
    [saveCard],
  );

  // Focus editor on 'n' key when not typing
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement;
        const isTyping =
          active instanceof HTMLElement &&
          (active.isContentEditable ||
            active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA");
        if (!isTyping) {
          e.preventDefault();
          editorRef.current?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Auto-focus editor on mount
  useEffect(() => {
    if (isContentReady && !isDecrypting) {
      editorRef.current?.focus();
    }
  }, [isContentReady, isDecrypting]);

  const handleEntrySave = useCallback(
    (segmentId: string, newHtml: string) => {
      const updated = segments.map((seg) =>
        seg.id === segmentId ? { ...seg, html: newHtml } : seg,
      );
      onChange(assembleSegments(updated));
    },
    [segments, onChange],
  );

  const focusTargetRef = useRef<string | null>(null);

  const handleEntryDelete = useCallback(
    (segmentId: string) => {
      // displaySegments is newest-first; "next later" = previous in display order
      const idx = displaySegments.findIndex((seg) => seg.id === segmentId);
      if (idx > 0) {
        focusTargetRef.current = displaySegments[idx - 1].id;
      } else if (idx < displaySegments.length - 1) {
        focusTargetRef.current = displaySegments[idx + 1].id;
      } else {
        focusTargetRef.current = null;
      }
      const updated = segments.filter((seg) => seg.id !== segmentId);
      onChange(assembleSegments(updated));
    },
    [segments, displaySegments, onChange],
  );

  // Image upload into top card
  const handleImageFile = useCallback(
    (file: File) => {
      if (!onImageDrop) return;
      const el = editorRef.current;
      if (!el) return;

      el.focus();
      placeCaretAtEnd(el);

      const placeholder = document.createElement("img");
      placeholder.setAttribute("data-image-id", "uploading");
      placeholder.setAttribute("alt", "Uploading...");
      const previewUrl = URL.createObjectURL(file);
      placeholder.setAttribute("src", previewUrl);
      insertNodeAtCursor(placeholder);
      handleInput();

      onImageDrop(file)
        .then(({ id, width, height, filename }) => {
          const finalImage = document.createElement("img");
          finalImage.setAttribute("data-image-id", id);
          finalImage.setAttribute("alt", filename);
          finalImage.setAttribute("width", String(width));
          finalImage.setAttribute("height", String(height));
          if (placeholder.isConnected) {
            placeholder.replaceWith(finalImage);
          }
        })
        .catch((error) => {
          console.error("Failed to upload image:", error);
          placeholder.remove();
        })
        .finally(() => {
          URL.revokeObjectURL(previewUrl);
          handleInput();
        });
    },
    [onImageDrop, handleInput],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) handleImageFile(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleImageFile],
  );

  if (!isContentReady) return null;

  if (isDecrypting) {
    return (
      <div className={styles.cardStack}>
        <div className={styles.emptyState}>Decrypting...</div>
      </div>
    );
  }

  return (
    <div className={styles.cardStack} ref={containerRef}>
      <NoteEditorHeader
        date={date}
        formattedDate={formattedDate}
        showReadonlyBadge={false}
        statusText={isDecrypting ? "Decrypting..." : null}
        weatherLabel={weatherLabel}
        debugKeyId={debugKeyId}
      />

      <div className={styles.topCard}>
        <div
          ref={editorRef}
          className={`${contentStyles.content} ${styles.editor}`}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          role="textbox"
          aria-multiline="true"
          aria-label="New entry"
          data-placeholder="What's on your mind?"
        />
        <button
          type="button"
          className={styles.saveButton}
          onClick={saveCard}
          aria-label="Save entry"
          title="Save entry"
        >
          <Check size={18} />
        </button>
      </div>

      {displaySegments.length > 0 && (
        <div className={styles.stack}>
          {displaySegments.map((segment) => (
            <LogEntry
              key={segment.id}
              id={segment.id}
              timestamp={segment.timestamp}
              label={segment.label}
              html={segment.html}
              onSave={(html) => handleEntrySave(segment.id, html)}
              onDelete={
                segments.length > 1
                  ? () => handleEntryDelete(segment.id)
                  : undefined
              }
              focusTargetRef={focusTargetRef}
            />
          ))}
        </div>
      )}

      {onImageDrop && (
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Insert image"
            title="Insert image"
          >
            <ImagePlus size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className={styles.imageInput}
            onChange={handleFileChange}
          />
        </div>
      )}
    </div>
  );
}
