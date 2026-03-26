import { useCallback, useRef } from "react";
import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
} from "react";
import { ImagePlus, Mic, Square, X } from "lucide-react";
import { NoteEditorHeader } from "./NoteEditorHeader";
import { NoteEditorContent } from "./NoteEditorContent";
import type { DropIndicatorPosition } from "./useDropIndicator";
import type { DailyWeatherData } from "../../features/weather/WeatherRepository";
import styles from "./NoteEditor.module.css";

interface NoteEditorViewProps {
  date: string;
  formattedDate: string;
  isEditable: boolean;
  autoFocus: boolean;
  showReadonlyBadge: boolean;
  statusText: string | null;
  isStatusError?: boolean;
  onRestore?: () => void;
  placeholderText: string;
  editorRef: RefObject<HTMLDivElement | null>;
  onInput?: (event: FormEvent<HTMLDivElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onImageSelect?: (file: File) => void;
  isRecording?: boolean;
  recordingDuration?: number;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onCancelRecording?: () => void;
  isDraggingImage?: boolean;
  dropIndicatorPosition?: DropIndicatorPosition | null;
  footer?: ReactNode;
  dailyWeather?: DailyWeatherData | null;
}

export function NoteEditorView({
  date,
  formattedDate,
  isEditable,
  autoFocus,
  showReadonlyBadge,
  statusText,
  isStatusError = false,
  onRestore,
  placeholderText,
  editorRef,
  onInput,
  onPaste,
  onDrop,
  onDragOver,
  onClick,
  onKeyDown,
  onImageSelect,
  isRecording = false,
  recordingDuration = 0,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  isDraggingImage = false,
  dropIndicatorPosition,
  footer,
  dailyWeather,
}: NoteEditorViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyClassName = styles.body;

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file && onImageSelect) {
        onImageSelect(file);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onImageSelect],
  );

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
        date={date}
        formattedDate={formattedDate}
        showReadonlyBadge={showReadonlyBadge}
        statusText={statusText}
        isStatusError={isStatusError}
        onRestore={onRestore}
        dailyWeather={dailyWeather}
      />
      <div className={bodyClassName}>
        <NoteEditorContent
          editorRef={editorRef}
          isEditable={isEditable}
          autoFocus={autoFocus}
          placeholderText={placeholderText}
          onInput={onInput}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onClick={onClick}
          onKeyDown={onKeyDown}
        />
      </div>
      {(onImageSelect || onStartRecording) && (
        <div className={styles.toolbar}>
          {onImageSelect && !isRecording && (
            <>
              <button
                type="button"
                className={styles.toolbarButton}
                onClick={handleButtonClick}
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
            </>
          )}
          {onStartRecording && !isRecording && (
            <button
              type="button"
              className={styles.toolbarButton}
              style={{ marginLeft: 4 }}
              onClick={onStartRecording}
              aria-label="Record audio"
              title="Record audio"
            >
              <Mic size={18} />
            </button>
          )}
          {isRecording && (
            <>
              <button
                type="button"
                className={`${styles.toolbarButton} ${styles.toolbarRecording}`}
                onClick={onStopRecording}
                aria-label="Stop recording"
                title="Stop recording"
              >
                <Square size={18} />
              </button>
              <button
                type="button"
                className={styles.toolbarButton}
                onClick={onCancelRecording}
                aria-label="Cancel recording"
                title="Cancel recording"
              >
                <X size={18} />
              </button>
              <span className={styles.recordingInfo}>
                {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")}
              </span>
            </>
          )}
        </div>
      )}
      {footer}
    </div>
  );
}
