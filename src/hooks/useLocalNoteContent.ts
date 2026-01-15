import { useCallback, useEffect, useReducer, useRef } from "react";
import type { NoteRepository } from "../storage/noteRepository";
import { isContentEmpty } from "../utils/sanitize";

interface SaveSnapshot {
  date: string;
  content: string;
  isEmpty: boolean;
}

export interface UseLocalNoteContentReturn {
  content: string;
  setContent: (content: string) => void;
  isLoading: boolean;
  hasEdits: boolean;
  isReady: boolean;
  error: Error | null;
  /** Allows external code to update content (e.g., from remote sync) */
  applyRemoteUpdate: (content: string) => void;
}

type LocalNoteState =
  | {
      status: "idle";
      date: null;
      content: "";
      hasEdits: false;
      error: null;
    }
  | {
      status: "loading";
      date: string;
      content: "";
      hasEdits: false;
      error: null;
    }
  | {
      status: "ready";
      date: string;
      content: string;
      hasEdits: boolean;
      error: null;
    }
  | {
      status: "error";
      date: string;
      content: string;
      hasEdits: boolean;
      error: Error;
    };

type LocalNoteAction =
  | { type: "RESET" }
  | { type: "LOAD_START"; date: string }
  | { type: "LOAD_SUCCESS"; date: string; content: string }
  | { type: "LOAD_ERROR"; date: string; error: Error }
  | { type: "EDIT"; content: string }
  | { type: "REMOTE_UPDATE"; date: string; content: string }
  | { type: "SAVE_SUCCESS"; date: string; content: string };

const initialState: LocalNoteState = {
  status: "idle",
  date: null,
  content: "",
  hasEdits: false,
  error: null,
};

function reducer(
  state: LocalNoteState,
  action: LocalNoteAction,
): LocalNoteState {
  switch (action.type) {
    case "RESET":
      return initialState;

    case "LOAD_START":
      return {
        status: "loading",
        date: action.date,
        content: "",
        hasEdits: false,
        error: null,
      };

    case "LOAD_SUCCESS":
      // Only accept if we're loading for this date
      if (state.status !== "loading" || state.date !== action.date) {
        return state;
      }
      return {
        status: "ready",
        date: action.date,
        content: action.content,
        hasEdits: false,
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
        error: action.error,
      };

    case "EDIT":
      // Can only edit when ready or in error state
      if (state.status !== "ready" && state.status !== "error") {
        return state;
      }
      return {
        status: "ready",
        date: state.date,
        content: action.content,
        hasEdits: true,
        error: null,
      };

    case "REMOTE_UPDATE":
      // Only accept remote updates if no local edits and same date
      if (state.date !== action.date || state.hasEdits) {
        return state;
      }
      // Can receive remote updates in ready or error state
      if (state.status !== "ready" && state.status !== "error") {
        return state;
      }
      return {
        status: "ready",
        date: action.date,
        content: action.content,
        hasEdits: false,
        error: null,
      };

    case "SAVE_SUCCESS":
      if (state.status !== "ready" || state.date !== action.date) {
        return state;
      }
      // Only clear hasEdits if content matches what was saved
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

/**
 * Hook for reading/writing note content from local storage (IDB).
 * This hook has NO network awareness - it only deals with local data.
 *
 * Responsibilities:
 * - Load note content from repository when date changes
 * - Save content to repository with debouncing
 * - Track edit state
 *
 * NOT responsible for:
 * - Checking online/offline status
 * - Syncing with remote
 * - Determining if note exists remotely but not locally
 */
export function useLocalNoteContent(
  date: string | null,
  repository: NoteRepository | null,
  onAfterSave?: (snapshot: SaveSnapshot) => void,
): UseLocalNoteContentReturn {
  const [state, dispatch] = useReducer(reducer, initialState);

  const saveTimeoutRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);
  const pendingSaveSnapshotRef = useRef<{
    date: string;
    content: string;
    repository: NoteRepository;
  } | null>(null);

  // Save function that queues saves to avoid race conditions
  const enqueueSave = useCallback(
    (saveDate: string, saveContent: string, saveRepository: NoteRepository) => {
      pendingSaveRef.current = (
        pendingSaveRef.current ?? Promise.resolve()
      ).then(async () => {
        try {
          const isEmpty = isContentEmpty(saveContent);
          if (!isEmpty) {
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
          onAfterSave?.({
            date: saveDate,
            content: saveContent,
            isEmpty,
          });
        } catch (error) {
          console.error("Failed to save note:", error);
        }
      });
    },
    [onAfterSave],
  );

  // Load content when date/repository changes
  // NOTE: No 'online' dependency - we always load from local storage
  useEffect(() => {
    // Flush any pending save before switching notes
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
        const note = await repository.get(date);
        const loadedContent = note?.content ?? "";

        if (!cancelled) {
          dispatch({ type: "LOAD_SUCCESS", date, content: loadedContent });
        }
      } catch (error) {
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
      if (state.status !== "ready" && state.status !== "error") return;
      if (newContent === state.content) return;
      dispatch({ type: "EDIT", content: newContent });
    },
    [state.status, state.content],
  );

  // Allow external code to apply remote updates
  const applyRemoteUpdate = useCallback(
    (content: string) => {
      if (!state.date) return;
      dispatch({ type: "REMOTE_UPDATE", date: state.date, content });
    },
    [state.date],
  );

  // Debounced auto-save effect
  useEffect(() => {
    if (
      state.status !== "ready" ||
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
    state.status,
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
    isLoading: state.status === "loading",
    hasEdits: state.hasEdits,
    isReady: state.status === "ready" || state.status === "error",
    error: state.error,
    applyRemoteUpdate,
  };
}
