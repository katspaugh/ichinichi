import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import WaveSurfer from "wavesurfer.js";
import RecordPlugin from "wavesurfer.js/dist/plugins/record.esm.js";
import { useNoteRepositoryContext } from "../../contexts/noteRepositoryContext";

interface UseAudioRecordingOptions {
  date: string;
  isEditable: boolean;
  editorRef: RefObject<HTMLDivElement | null>;
  onContentChange: () => void;
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4;codecs=opus",
    "audio/webm",
  ];
  for (const mt of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mt)) {
      return mt;
    }
  }
  return "";
}

function fileExtForMime(mime: string): string {
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime.startsWith("audio/mp4")) return "m4a";
  return "webm";
}

/** Remove placeholder div and its trailing <br> from the DOM */
function removePlaceholderAndBr(placeholder: HTMLDivElement) {
  const next = placeholder.nextSibling;
  if (next && next.nodeType === Node.ELEMENT_NODE && (next as HTMLElement).tagName === "BR") {
    next.remove();
  }
  placeholder.remove();
}

export function useAudioRecording({
  date,
  isEditable,
  editorRef,
  onContentChange,
}: UseAudioRecordingOptions) {
  const { imageRepository } = useNoteRepositoryContext();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const recordPluginRef = useRef<RecordPlugin | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const mimeRef = useRef<string>("");
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    // Explicitly stop mic tracks (Safari may not release via destroy alone)
    const record = recordPluginRef.current;
    if (record) {
      try {
        const mr = (record as unknown as { mediaRecorder?: MediaRecorder })
          .mediaRecorder;
        mr?.stream?.getTracks().forEach((t) => t.stop());
      } catch {
        // Best-effort
      }
    }
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }
    recordPluginRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  const startRecording = useCallback(async () => {
    if (!isEditable || !imageRepository || isRecording) return;

    const mime = pickMimeType();
    if (!mime) {
      console.error("No supported audio recording format found");
      return;
    }
    mimeRef.current = mime;

    // Insert placeholder at cursor
    const editor = editorRef.current;
    if (!editor) return;

    const placeholder = document.createElement("div");
    placeholder.setAttribute("data-audio-id", "recording");
    placeholder.setAttribute("contenteditable", "false");

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.collapse(false);
      range.insertNode(placeholder);
      // Add a <br> after so the cursor has somewhere to land
      const br = document.createElement("br");
      placeholder.after(br);
      range.setStartAfter(br);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editor.appendChild(placeholder);
      editor.appendChild(document.createElement("br"));
    }
    placeholderRef.current = placeholder;

    // Create WaveSurfer instance inside the placeholder for live waveform
    const ws = WaveSurfer.create({
      container: placeholder,
      height: 32,
      waveColor: "var(--color-text-muted, #94a3b8)",
      progressColor: "var(--color-link, #3b82f6)",
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      interact: false,
      cursorWidth: 0,
    });
    wavesurferRef.current = ws;

    const record = ws.registerPlugin(
      RecordPlugin.create({
        mimeType: mime,
        renderRecordedAudio: false,
        continuousWaveform: true,
        continuousWaveformDuration: 30,
      }),
    );
    recordPluginRef.current = record;

    record.on("record-progress", (time: number) => {
      setRecordingDuration(Math.floor(time / 1000));
    });

    try {
      await record.startRecording();
    } catch (err) {
      console.error("Microphone access denied:", err);
      removePlaceholderAndBr(placeholder);
      placeholderRef.current = null;
      cleanup();
      return;
    }

    setIsRecording(true);
    setRecordingDuration(0);
  }, [isEditable, imageRepository, isRecording, editorRef, cleanup]);

  const stopRecording = useCallback(async () => {
    const record = recordPluginRef.current;
    if (!record || !record.isRecording()) return;

    const blob = await new Promise<Blob>((resolve) => {
      record.once("record-end", (b: Blob) => resolve(b));
      record.stopRecording();
    });

    const mime = mimeRef.current;
    const ext = fileExtForMime(mime);

    // Upload via image repository (reuses encryption pipeline)
    if (imageRepository && placeholderRef.current) {
      try {
        const result = await imageRepository.upload(date, blob, "inline", `recording.${ext}`, {
          width: 0,
          height: 0,
        });

        if (!mountedRef.current) {
          cleanup();
          return;
        }

        if (result.ok) {
          placeholderRef.current.setAttribute("data-audio-id", result.value.id);
          // Clear wavesurfer DOM so playback hook can reinitialize
          while (placeholderRef.current.firstChild) placeholderRef.current.firstChild.remove();
          placeholderRef.current = null;
          onContentChange();
        } else {
          console.error("Audio upload failed:", result);
          removePlaceholderAndBr(placeholderRef.current);
          placeholderRef.current = null;
          onContentChange();
        }
      } catch (err) {
        console.error("Audio upload error:", err);
        if (placeholderRef.current) {
          removePlaceholderAndBr(placeholderRef.current);
          placeholderRef.current = null;
          onContentChange();
        }
      }
    }

    cleanup();
  }, [date, imageRepository, onContentChange, cleanup]);

  const cancelRecording = useCallback(() => {
    const record = recordPluginRef.current;
    if (record && record.isRecording()) {
      record.stopRecording();
    }

    if (placeholderRef.current) {
      removePlaceholderAndBr(placeholderRef.current);
      placeholderRef.current = null;
      onContentChange();
    }

    cleanup();
  }, [onContentChange, cleanup]);

  // Cleanup on unmount to prevent leaked MediaStream / wavesurfer
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (placeholderRef.current) {
        removePlaceholderAndBr(placeholderRef.current);
        placeholderRef.current = null;
      }
      cleanup();
    };
  }, [cleanup]);

  return {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
    canRecord: isEditable && !!imageRepository,
  };
}
