import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ChangeEvent } from "react";
import { Check, ImagePlus } from "lucide-react";
import { parseNoteSegments, assembleSegments } from "../../utils/noteSegments";
import { applyTextTransforms } from "../../services/editorTextTransforms";
import {
  formatTimestampLabel,
  getTimestampLabel,
} from "../../services/timestampLabel";
import { formatDateDisplay, getTodayString, isToday } from "../../utils/date";
import { useRoutingContext } from "../../contexts/routingContext";
import { useWeatherContext } from "../../contexts/weatherContext";
import { useNoteRepositoryContext } from "../../contexts/noteRepositoryContext";
import {
  useInlineImageUpload,
  useInlineImageUrls,
} from "../NoteEditor/useInlineImages";
import { NoteEditorHeader } from "../NoteEditor/NoteEditorHeader";
import { useDebugNoteKeyId } from "../../hooks/useDebugNoteKeyId";
import { useShareTarget } from "../../hooks/useShareTarget";
import { useHabits } from "../../hooks/useHabits";
import { applySectionColors } from "../../services/sectionColors";
import { LogEntry } from "./LogEntry";
import { HabitChips } from "./HabitChips";
import { TimeLabel } from "./TimeLabel";
import { useSectionTransform } from "./useSectionTransform";
import { useEntryHandoff } from "./useEntryHandoff";
import contentStyles from "../../styles/noteContent.module.css";
import styles from "./NoteLogView.module.css";
import type { DailyWeatherData } from "../../domain/weather/WeatherRepository";

const AUTO_SAVE_MS = 10 * 60 * 1000;

/** The held entry is a finalized stand-in, never edited in place. */
const noop = () => {};

interface NoteLogViewProps {
  date: string;
  content: string;
  onChange: (content: string) => void;
  isContentReady: boolean;
  isDecrypting?: boolean;
  /** Past days: show the timeline without the composer or editing. */
  readOnly?: boolean;
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
  readOnly = false,
}: NoteLogViewProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the native file picker is open. On mobile the picker (or the
  // camera) backgrounds the page, which must not commit and clear the composer
  // the user is about to insert a photo into.
  const pickerOpenRef = useRef(false);
  // Uploads still in flight; a save requested meanwhile runs when they finish
  // so the entry stores the real image id instead of the placeholder.
  const pendingUploadsRef = useRef(0);
  const saveAfterUploadRef = useRef(false);
  // Blob preview URLs of images currently shown in the composer. They stay
  // alive until the entry is saved because the composer is not part of
  // `content`, so nothing else resolves a URL for its images.
  const previewUrlsRef = useRef<Set<string>>(new Set());
  // A submitted entry keeps the composer's place, finalized, before the
  // editor comes back; see useEntryHandoff.
  const {
    held: heldEntry,
    releasedId,
    isRevealing,
    commit: commitEntry,
    reveal: revealEntry,
  } = useEntryHandoff(date);

  // Header: date, weather, debug key
  const formattedDate = formatDateDisplay(date);
  const debugKeyId = useDebugNoteKeyId(date, isContentReady);
  const { navigateToDate } = useRoutingContext();
  const handleJumpToToday = useCallback(() => {
    navigateToDate(getTodayString());
  }, [navigateToDate]);
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

  // Habits: chips under the composer and streaks in the header, today only
  const showHabits = !readOnly && isToday(date);
  const { habits } = useHabits({ todayContent: showHabits ? content : undefined });

  // Image upload
  const { onImageDrop } = useInlineImageUpload({
    date,
    isEditable: !readOnly,
  });

  // The held entry re-mounts as a timeline card when the handoff ends, so the
  // image URLs resolved into the stand-in's DOM have to be applied again.
  useInlineImageUrls({
    date,
    content,
    editorRef: containerRef,
    revision: heldEntry?.id ?? "",
  });

  const segments = useMemo(() => {
    if (!isContentReady || isDecrypting) return [];
    return parseNoteSegments(content);
  }, [content, isContentReady, isDecrypting]);

  // Reverse for newest-first display. The held entry is shown by the composer
  // in the place it was typed, so it must not also sit at the top of the stack.
  const heldId = heldEntry?.id ?? null;
  const displaySegments = useMemo(
    () => [...segments].reverse().filter((segment) => segment.id !== heldId),
    [segments, heldId],
  );

  const hasEditorContent = useCallback(() => {
    const el = editorRef.current;
    if (!el) return false;
    const text = (el.textContent ?? "").trim();
    return text.length > 0 || el.querySelector("img") !== null;
  }, []);

  const releasePreviewUrls = useCallback(() => {
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    previewUrlsRef.current.clear();
  }, []);

  const saveCard = useCallback(() => {
    const el = editorRef.current;
    if (!el || !hasEditorContent()) return;

    if (pendingUploadsRef.current > 0) {
      saveAfterUploadRef.current = true;
      return;
    }

    const timestamp = new Date().toISOString();
    const label = getTimestampLabel(timestamp);
    const labelAttr = label ? ` data-label="${label}"` : "";
    const hrHtml = `<hr data-timestamp="${timestamp}"${labelAttr} contenteditable="false">`;
    const entryHtml = serializeContent(el);
    onChange(content + hrHtml + entryHtml);

    // Hold the finalized entry where it was written before the editor returns
    commitEntry({ id: timestamp, date, label: label || null, html: entryHtml });

    // Clear editor
    el.textContent = "";
    releasePreviewUrls();
    el.focus();

    // Clear auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, [
    content,
    date,
    onChange,
    hasEditorContent,
    releasePreviewUrls,
    commitEntry,
  ]);

  const resetAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      saveCard();
    }, AUTO_SAVE_MS);
  }, [saveCard]);

  // Keep latest saveCard reachable from stable event listeners below.
  const saveCardRef = useRef(saveCard);
  useEffect(() => {
    saveCardRef.current = saveCard;
  }, [saveCard]);

  // Save pending top-card input when leaving the editor — in-app navigation
  // (unmount), tab backgrounding (visibilitychange), or tab close (pagehide).
  // Without this, typing in the new-entry card and clicking the logo or another
  // route silently drops the input since the editor only commits on save.
  useEffect(() => {
    if (readOnly) return;
    const previewUrls = previewUrlsRef.current;
    const saveIfHidden = () => {
      if (document.visibilityState !== "hidden") {
        pickerOpenRef.current = false;
        return;
      }
      if (pickerOpenRef.current) return;
      saveCardRef.current();
    };
    const savePending = () => saveCardRef.current();
    const pickerClosed = () => {
      pickerOpenRef.current = false;
    };
    document.addEventListener("visibilitychange", saveIfHidden);
    window.addEventListener("pagehide", savePending);
    window.addEventListener("focus", pickerClosed);
    return () => {
      document.removeEventListener("visibilitychange", saveIfHidden);
      window.removeEventListener("pagehide", savePending);
      window.removeEventListener("focus", pickerClosed);
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      savePending();
      for (const url of previewUrls) {
        URL.revokeObjectURL(url);
      }
      previewUrls.clear();
    };
  }, [readOnly]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    applyTextTransforms(el);
    applySectionColors(el);
    revealEntry();
    if (hasEditorContent()) {
      resetAutoSaveTimer();
    }
  }, [hasEditorContent, resetAutoSaveTimer, revealEntry]);

  useSectionTransform(editorRef, handleInput);

  // Start a `+type` section in the composer, as typing the line would
  const handlePickHabit = useCallback(
    (type: string) => {
      const el = editorRef.current;
      if (!el) return;
      // A lone <br> is an empty editor; drop it so the header takes line one
      if (el.childNodes.length === 1 && el.firstChild instanceof HTMLBRElement) {
        el.firstChild.remove();
      }
      const header = document.createElement("div");
      header.setAttribute("data-section-type", type);
      header.textContent = `+${type}`;
      const body = document.createElement("div");
      body.appendChild(document.createElement("br"));
      el.append(header, body);
      applySectionColors(el);

      el.focus();
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.setStart(body, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      handleInput();
    },
    [handleInput],
  );

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
    if (readOnly) return;
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
  }, [readOnly]);

  // Auto-focus editor on mount
  useEffect(() => {
    if (readOnly) return;
    if (isContentReady && !isDecrypting) {
      editorRef.current?.focus();
    }
  }, [isContentReady, isDecrypting, readOnly]);

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
      previewUrlsRef.current.add(previewUrl);
      placeholder.setAttribute("src", previewUrl);
      insertNodeAtCursor(placeholder);
      handleInput();

      pendingUploadsRef.current += 1;
      onImageDrop(file)
        .then(({ id, width, height, filename }) => {
          // Promote the placeholder in place, keeping the preview as its src.
          // An <img> with an id but no src shows the loading shimmer, and the
          // composer's images are only resolved once the entry is saved.
          placeholder.setAttribute("data-image-id", id);
          placeholder.setAttribute("alt", filename);
          placeholder.setAttribute("width", String(width));
          placeholder.setAttribute("height", String(height));
        })
        .catch((error) => {
          console.error("Failed to upload image:", error);
          placeholder.remove();
          previewUrlsRef.current.delete(previewUrl);
          URL.revokeObjectURL(previewUrl);
        })
        .finally(() => {
          handleInput();
          pendingUploadsRef.current -= 1;
          if (pendingUploadsRef.current === 0 && saveAfterUploadRef.current) {
            saveAfterUploadRef.current = false;
            saveCardRef.current();
          }
        });
    },
    [onImageDrop, handleInput],
  );

  const openFilePicker = useCallback(() => {
    pickerOpenRef.current = true;
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      pickerOpenRef.current = false;
      const file = event.target.files?.[0];
      if (file) handleImageFile(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleImageFile],
  );

  // Photos shared to the app via the Web Share Target API land on today's
  // note, which is this view.
  useShareTarget(
    onImageDrop ? handleImageFile : undefined,
    isContentReady && !isDecrypting,
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
        showReadonlyBadge={readOnly}
        onJumpToToday={readOnly ? handleJumpToToday : undefined}
        statusText={isDecrypting ? "Decrypting..." : null}
        weatherLabel={weatherLabel}
        debugKeyId={debugKeyId}
        streaks={showHabits ? habits : undefined}
      />

      <div className={styles.timeline}>
        {!readOnly && (
          <div
            className={styles.composer}
            data-moment-time="now"
            data-committed={heldEntry ? true : undefined}
            data-entering={isRevealing || undefined}
          >
            <span className={styles.composerNode} aria-hidden="true" />
            <span className={styles.composerTime}>
              <TimeLabel
                label={formatTimestampLabel(new Date().toISOString())}
              />
            </span>
            {heldEntry && (
              <div className={styles.committed}>
                <LogEntry
                  id={heldEntry.id}
                  timestamp={heldEntry.id}
                  label={heldEntry.label}
                  html={heldEntry.html}
                  onSave={noop}
                  readOnly
                />
              </div>
            )}
            <div className={styles.composerShell}>
              <div className={styles.composerBox}>
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
                {onImageDrop && (
                  <div className={styles.composerTools}>
                    <button
                      type="button"
                      className={styles.toolButton}
                      onClick={openFilePicker}
                      aria-label="Insert image"
                      title="Insert image"
                    >
                      <ImagePlus size={16} />
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
                {showHabits && (
                  <HabitChips habits={habits} onPick={handlePickHabit} />
                )}
                <button
                  type="button"
                  className={styles.saveButton}
                  onClick={saveCard}
                  aria-label="Save entry"
                  title="Save entry (⌘⏎)"
                >
                  <Check size={16} strokeWidth={2.6} />
                </button>
              </div>
            </div>
          </div>
        )}

        {readOnly && displaySegments.length === 0 && (
          <div className={styles.emptyState}>Nothing written on this day.</div>
        )}

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
                  !readOnly && segments.length > 1
                    ? () => handleEntryDelete(segment.id)
                    : undefined
                }
                focusTargetRef={focusTargetRef}
                justSaved={releasedId === segment.id}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}

        <span className={styles.railEnd} aria-hidden="true" />
      </div>
    </div>
  );
}
