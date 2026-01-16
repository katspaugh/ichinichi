import { useCallback } from "react";
import type { NoteRepository } from "../storage/noteRepository";
import { useLocalNoteContent } from "./useLocalNoteContent";
import { useNoteRemoteSync } from "./useNoteRemoteSync";

interface SaveSnapshot {
  date: string;
  content: string;
  isEmpty: boolean;
}

export interface UseNoteContentReturn {
  content: string;
  setContent: (content: string) => void;
  isDecrypting: boolean;
  hasEdits: boolean;
  /** True when the note is being saved (dirty or saving state) */
  isSaving: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
}

// Legacy types and reducer for backward compatibility with tests
// These map to the old interface that included isDecrypting/isContentReady/isOfflineStub
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
 * The actual hook implementation uses a simpler internal state machine.
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

/**
 * Main hook for note content management.
 *
 * This hook composes:
 * - useLocalNoteContent: Handles reading/writing from local storage (IDB)
 * - useNoteRemoteSync: Handles background sync with remote server
 *
 * Architecture benefits:
 * - Local reads never fail due to network issues
 * - Going offline doesn't trigger unnecessary reloads
 * - Clear separation between local state and sync concerns
 */
export function useNoteContent(
  date: string | null,
  repository: NoteRepository | null,
  hasNoteForDate?: (date: string) => boolean,
  onAfterSave?: (snapshot: SaveSnapshot) => void,
): UseNoteContentReturn {
  // Local storage operations (no network awareness)
  const local = useLocalNoteContent(date, repository, onAfterSave);

  // Handle remote updates by applying them to local state
  const handleRemoteUpdate = useCallback(
    (content: string) => {
      local.applyRemoteUpdate(content);
    },
    [local],
  );

  // Remote sync operations (network aware)
  const remote = useNoteRemoteSync(date, repository, {
    onRemoteUpdate: handleRemoteUpdate,
    localContent: local.content,
    hasLocalEdits: local.hasEdits,
    isLocalReady: local.isReady,
  });

  // Determine if this is an offline stub:
  // - Local content is empty (no local copy)
  // - AND we're not still loading
  // - AND either:
  //   - hasNoteForDate says it exists (calendar shows a dot)
  //   - OR remote sync says we know it's remote-only
  const isOfflineStub =
    local.isReady &&
    local.content === "" &&
    !local.hasEdits &&
    ((date !== null && hasNoteForDate?.(date) === true) ||
      remote.isKnownRemoteOnly);

  return {
    content: local.content,
    setContent: local.setContent,
    isDecrypting: local.isLoading,
    hasEdits: local.hasEdits,
    isSaving: local.isSaving,
    isContentReady: local.isReady,
    isOfflineStub,
  };
}
