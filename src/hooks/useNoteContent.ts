import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { NoteRepository } from "../storage/noteRepository";
import type { HabitValues } from "../types";
import { useConnectivity } from "./useConnectivity";
import {
  noteContentStore,
  type SaveSnapshot,
  type NoteContentState as StoreState,
} from "../stores/noteContentStore";

export type { SaveSnapshot };

export interface UseNoteContentReturn {
  content: string;
  setContent: (content: string) => void;
  habits: HabitValues | undefined;
  setHabits: (habits: HabitValues) => void;
  isDecrypting: boolean;
  hasEdits: boolean;
  /** True when the note is being saved (dirty or saving state) */
  isSaving: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
  /** Error from loading/decrypting the note (e.g. DecryptFailed) */
  error: Error | null;
  /** Force a refresh from remote (used for realtime updates) */
  forceRefresh: () => void;
}

// Legacy types and reducer for backward compatibility with tests
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

/**
 * Legacy reducer for backward compatibility with existing tests.
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
      if (state.date !== action.date || state.hasEdits) {
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

// Zustand selectors for fine-grained re-renders
function useStoreSelector<T>(selector: (state: StoreState) => T): T {
  return useSyncExternalStore(
    noteContentStore.subscribe,
    () => selector(noteContentStore.getState()),
    () => selector(noteContentStore.getState()),
  );
}

/**
 * Main hook for note content management.
 *
 * Thin wrapper over noteContentStore (Zustand vanilla store).
 * Composes local storage + remote refresh in a single store.
 */
export function useNoteContent(
  date: string | null,
  repository: NoteRepository | null,
  hasNoteForDate?: (date: string) => boolean,
  onAfterSave?: (snapshot: SaveSnapshot) => void,
): UseNoteContentReturn {
  const online = useConnectivity();
  const store = noteContentStore;

  // Track previous date/repository to detect changes
  const prevDateRef = useRef<string | null>(null);
  const prevRepoRef = useRef<NoteRepository | null>(null);

  // Keep afterSave callback in sync
  useEffect(() => {
    store.getState().setAfterSave(onAfterSave);
  }, [onAfterSave, store]);

  // Init / switchNote / dispose lifecycle
  useEffect(() => {
    if (!date || !repository) {
      // Dispose if we had something before
      if (prevDateRef.current || prevRepoRef.current) {
        void store.getState().dispose();
      }
      prevDateRef.current = null;
      prevRepoRef.current = null;
      return;
    }

    const dateChanged = date !== prevDateRef.current;
    const repoChanged = repository !== prevRepoRef.current;

    if (repoChanged) {
      // Repository changed — full re-init
      store.getState().init(date, repository, onAfterSave);
    } else if (dateChanged) {
      // Same repo, different date — switch note (flushes save first)
      void store.getState().switchNote(date);
    }

    prevDateRef.current = date;
    prevRepoRef.current = repository;

    return () => {
      void store.getState().dispose();
      prevDateRef.current = null;
      prevRepoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, repository]);

  // Subscribe to store slices for fine-grained re-renders
  const content = useStoreSelector((s) => s.content);
  const habits = useStoreSelector((s) => s.habits);
  const hasEdits = useStoreSelector((s) => s.hasEdits);
  const isSaving = useStoreSelector((s) => s.isSaving);
  const status = useStoreSelector((s) => s.status);
  const error = useStoreSelector((s) => s.error);
  const remoteCacheResult = useStoreSelector((s) => s.remoteCacheResult);

  const isReady =
    status === "ready" || status === "error";
  const isLoading = status === "loading";

  // Determine offline stub
  const isOfflineStub =
    isReady &&
    content === "" &&
    !hasEdits &&
    !online &&
    ((date !== null && hasNoteForDate?.(date) === true) ||
      (!online &&
        remoteCacheResult !== null &&
        remoteCacheResult.date === date &&
        remoteCacheResult.hasRemote));

  const setContent = useCallback(
    (newContent: string) => store.getState().setContent(newContent),
    [store],
  );
  const setHabits = useCallback(
    (newHabits: HabitValues) => store.getState().setHabits(newHabits),
    [store],
  );
  const forceRefresh = useCallback(
    () => store.getState().forceRefresh(),
    [store],
  );

  return {
    content,
    setContent,
    habits,
    setHabits,
    isDecrypting: isLoading,
    hasEdits,
    isSaving,
    isContentReady: isReady,
    isOfflineStub,
    error,
    forceRefresh,
  };
}
