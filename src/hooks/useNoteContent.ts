import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Note } from "../types";
import type { NoteRepository } from "../storage/noteRepository";
import { isContentEmpty } from "../utils/sanitize";
import { OfflineStubError } from "../storage/unifiedSyncedNoteRepository";

interface UseNoteContentReturn {
  content: string;
  setContent: (content: string) => void;
  isDecrypting: boolean;
  hasEdits: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
}

export type NoteContentState =
  | {
      status: "idle";
      date: null;
      content: "";
      hasEdits: false;
      isDecrypting: false;
      isContentReady: false;
      isOfflineStub: false;
      error: null;
    }
  | {
      status: "loading";
      date: string;
      content: "";
      hasEdits: false;
      isDecrypting: true;
      isContentReady: false;
      isOfflineStub: false;
      error: null;
    }
  | {
      status: "ready";
      date: string;
      content: string;
      hasEdits: boolean;
      isDecrypting: false;
      isContentReady: true;
      isOfflineStub: false;
      error: null;
    }
  | {
      status: "offline_stub";
      date: string;
      content: "";
      hasEdits: false;
      isDecrypting: false;
      isContentReady: true;
      isOfflineStub: true;
      error: null;
    }
  | {
      status: "error";
      date: string;
      content: string;
      hasEdits: boolean;
      isDecrypting: false;
      isContentReady: true;
      isOfflineStub: false;
      error: Error;
    };

export type NoteContentAction =
  | { type: "RESET" }
  | { type: "LOAD_START"; date: string }
  | { type: "LOAD_SUCCESS"; date: string; content: string }
  | { type: "LOAD_ERROR"; date: string; error: Error }
  | { type: "LOAD_OFFLINE_STUB"; date: string }
  | { type: "REMOTE_UPDATE"; date: string; content: string }
  | { type: "EDIT"; content: string }
  | { type: "SAVE_SUCCESS"; date: string; content: string };

export const initialNoteContentState: NoteContentState = {
  status: "idle",
  date: null,
  content: "",
  hasEdits: false,
  isDecrypting: false,
  isContentReady: false,
  isOfflineStub: false,
  error: null,
};

/*
State transitions:
- RESET -> idle
- LOAD_START(date) -> loading
- LOAD_SUCCESS(date, content) -> ready
- LOAD_ERROR(date, error) -> error (content ready, editable)
- LOAD_OFFLINE_STUB(date) -> offline_stub (note exists but not cached)
- REMOTE_UPDATE(date, content) -> ready (if same date and no edits)
- EDIT(content) -> ready with hasEdits
- SAVE_SUCCESS(date, content) -> ready with hasEdits false (if content unchanged)
*/
export function noteContentReducer(
  state: NoteContentState,
  action: NoteContentAction,
): NoteContentState {
  switch (action.type) {
    case "RESET":
      return initialNoteContentState;
    case "LOAD_START":
      return {
        status: "loading",
        date: action.date,
        content: "",
        hasEdits: false,
        isDecrypting: true,
        isContentReady: false,
        isOfflineStub: false,
        error: null,
      };
    case "LOAD_SUCCESS":
      if (state.status !== "loading" || state.date !== action.date) {
        return state;
      }
      return {
        status: "ready",
        date: action.date,
        content: action.content,
        hasEdits: false,
        isDecrypting: false,
        isContentReady: true,
        isOfflineStub: false,
        error: null,
      };
    case "LOAD_ERROR":
      if (state.status !== "loading" || state.date !== action.date) {
        return state;
      }
      return {
        status: "error",
        date: action.date,
        content: "",
        hasEdits: false,
        isDecrypting: false,
        isContentReady: true,
        isOfflineStub: false,
        error: action.error,
      };
    case "LOAD_OFFLINE_STUB":
      if (state.status !== "loading" || state.date !== action.date) {
        return state;
      }
      return {
        status: "offline_stub",
        date: action.date,
        content: "",
        hasEdits: false,
        isDecrypting: false,
        isContentReady: true,
        isOfflineStub: true,
        error: null,
      };
    case "REMOTE_UPDATE":
      if (state.date !== action.date || state.hasEdits) {
        return state;
      }
      return {
        status: "ready",
        date: action.date,
        content: action.content,
        hasEdits: false,
        isDecrypting: false,
        isContentReady: true,
        isOfflineStub: false,
        error: null,
      };
    case "EDIT":
      if (!state.isContentReady) {
        return state;
      }
      return {
        status: "ready",
        date: state.date,
        content: action.content,
        hasEdits: true,
        isDecrypting: false,
        isContentReady: true,
        isOfflineStub: false,
        error: null,
      };
    case "SAVE_SUCCESS":
      if (state.status !== "ready" || state.date !== action.date) {
        return state;
      }
      if (state.content !== action.content) {
        return state;
      }
      return {
        ...state,
        hasEdits: false,
      };
    default:
      return state;
  }
}

export function useNoteContent(
  date: string | null,
  repository: NoteRepository | null,
  onAfterSave?: () => void,
): UseNoteContentReturn {
  const [state, dispatch] = useReducer(
    noteContentReducer,
    initialNoteContentState,
  );
  const saveTimeoutRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);
  const pendingSaveSnapshotRef = useRef<{
    date: string;
    content: string;
    repository: NoteRepository;
  } | null>(null);

  const enqueueSave = useCallback(
    (saveDate: string, saveContent: string, saveRepository: NoteRepository) => {
      pendingSaveRef.current = (
        pendingSaveRef.current ?? Promise.resolve()
      ).then(async () => {
        try {
          if (!isContentEmpty(saveContent)) {
            await saveRepository.save(saveDate, saveContent);
          } else {
            await saveRepository.delete(saveDate);
          }
          if (isMountedRef.current) {
            dispatch({
              type: "SAVE_SUCCESS",
              date: saveDate,
              content: saveContent,
            });
          }
          onAfterSave?.();
        } catch (error) {
          console.error("Failed to save note:", error);
        }
      });
    },
    [onAfterSave],
  );

  // Load content when date/repository changes
  useEffect(() => {
    if (saveTimeoutRef.current !== null && pendingSaveSnapshotRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      const snapshot = pendingSaveSnapshotRef.current;
      pendingSaveSnapshotRef.current = null;
      enqueueSave(snapshot.date, snapshot.content, snapshot.repository);
    }

    if (!date || !repository) {
      dispatch({ type: "RESET" });
      return;
    }

    let cancelled = false;
    dispatch({ type: "LOAD_START", date });

    const load = async () => {
      try {
        if (
          "getWithRefresh" in repository &&
          typeof repository.getWithRefresh === "function"
        ) {
          const note = await repository.getWithRefresh(
            date,
            (remoteNote: Note | null) => {
              const updatedContent = remoteNote?.content ?? "";
              if (cancelled) return;
              dispatch({
                type: "REMOTE_UPDATE",
                date,
                content: updatedContent,
              });
            },
          );
          const loadedContent = note?.content ?? "";
          if (!cancelled) {
            dispatch({ type: "LOAD_SUCCESS", date, content: loadedContent });
          }
          return;
        }

        const note = await repository.get(date);
        const loadedContent = note?.content ?? "";

        if (!cancelled) {
          dispatch({ type: "LOAD_SUCCESS", date, content: loadedContent });
        }
      } catch (error) {
        if (error instanceof OfflineStubError) {
          if (!cancelled) {
            dispatch({ type: "LOAD_OFFLINE_STUB", date });
          }
          return;
        }
        console.error("Failed to load note:", error);
        if (!cancelled) {
          dispatch({
            type: "LOAD_ERROR",
            date,
            error:
              error instanceof Error ? error : new Error("Failed to load note"),
          });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [date, repository, enqueueSave]);

  // Update content
  const setContent = useCallback(
    (newContent: string) => {
      if (!state.isContentReady) return;
      if (newContent === state.content) return;

      dispatch({ type: "EDIT", content: newContent });
    },
    [state.isContentReady, state.content],
  );

  useEffect(() => {
    if (
      !state.isContentReady ||
      !state.hasEdits ||
      !state.date ||
      !repository
    ) {
      return;
    }

    const snapshot = {
      date: state.date,
      content: state.content,
      repository,
    };

    pendingSaveSnapshotRef.current = snapshot;

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      saveTimeoutRef.current = null;
      pendingSaveSnapshotRef.current = null;
      enqueueSave(snapshot.date, snapshot.content, snapshot.repository);
    }, 400);

    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [
    state.content,
    state.hasEdits,
    state.isContentReady,
    state.date,
    repository,
    enqueueSave,
  ]);

  // Save on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (pendingSaveSnapshotRef.current) {
        const snapshot = pendingSaveSnapshotRef.current;
        pendingSaveSnapshotRef.current = null;
        enqueueSave(snapshot.date, snapshot.content, snapshot.repository);
      }
    };
  }, [enqueueSave]);

  return {
    content: state.content,
    setContent,
    isDecrypting: state.isDecrypting,
    hasEdits: state.hasEdits,
    isContentReady: state.isContentReady,
    isOfflineStub: state.isOfflineStub,
  };
}
