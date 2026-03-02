import { createStore } from "zustand/vanilla";
import type { NoteRepository } from "../storage/noteRepository";
import type { HabitValues } from "../types";
import { findLatestHabitDefinitions } from "../features/habits/findLatestHabitDefinitions";
import { isNoteEmpty, isContentEmpty } from "../utils/sanitize";
import { connectivity } from "../services/connectivity";

export interface SaveSnapshot {
  date: string;
  content: string;
  isEmpty: boolean;
}

type NoteRefreshResult =
  | { ok: true; value: { content?: string; habits?: HabitValues } | null }
  | { ok: false; error: { message: string } }
  | { content?: string; habits?: HabitValues }
  | null;

interface RefreshableNoteRepository {
  refreshNote: (date: string) => Promise<NoteRefreshResult>;
}

interface RemoteIndexRepository {
  hasRemoteDateCached: (date: string) => Promise<boolean>;
}

interface PendingOpRepository {
  hasPendingOp: (date: string) => Promise<boolean>;
}

function canRefresh(
  repository: NoteRepository,
): repository is NoteRepository & RefreshableNoteRepository {
  return (
    "refreshNote" in repository && typeof repository.refreshNote === "function"
  );
}

function hasRemoteIndex(
  repository: NoteRepository,
): repository is NoteRepository & RemoteIndexRepository {
  return (
    "hasRemoteDateCached" in repository &&
    typeof repository.hasRemoteDateCached === "function"
  );
}

function hasPendingOps(
  repository: NoteRepository,
): repository is NoteRepository & PendingOpRepository {
  return (
    "hasPendingOp" in repository &&
    typeof repository.hasPendingOp === "function"
  );
}

function unwrapRefreshResult(
  result: NoteRefreshResult,
): { content?: string; habits?: HabitValues } | null {
  if (!result) return null;
  if (typeof result === "object" && "ok" in result) {
    return result.ok ? result.value : null;
  }
  return result;
}

const SAVE_IDLE_DELAY_MS = 2000;

export interface NoteContentState {
  // Core note
  status: "idle" | "loading" | "ready" | "error";
  date: string | null;
  content: string;
  habits: HabitValues | undefined;
  hasEdits: boolean;
  error: Error | null;
  loadedWithContent: boolean;

  // Save
  isSaving: boolean;
  _saveTimer: number | null;
  _savePromise: Promise<void> | null;

  // Remote refresh
  isRefreshing: boolean;
  hasRefreshedForDate: string | null;
  remoteCacheResult: { date: string; hasRemote: boolean } | null;

  // Dependencies (set via init)
  repository: NoteRepository | null;
  afterSave: ((snapshot: SaveSnapshot) => void) | null;

  // Actions
  init: (
    date: string,
    repository: NoteRepository,
    afterSave?: (snapshot: SaveSnapshot) => void,
  ) => void;
  switchNote: (date: string) => Promise<void>;
  dispose: () => Promise<void>;
  setContent: (content: string) => void;
  setHabits: (habits: HabitValues) => void;
  flushSave: () => Promise<void>;
  applyRemoteUpdate: (content: string, habits?: HabitValues) => void;
  refreshFromRemote: () => Promise<void>;
  forceRefresh: () => void;
  checkRemoteCache: () => Promise<void>;
  setAfterSave: (callback?: (snapshot: SaveSnapshot) => void) => void;
}

export const noteContentStore = createStore<NoteContentState>()((set, get) => {
  // --- internal helpers ---

  let _loadGeneration = 0;
  let _refreshGeneration = 0;

  const _clearSaveTimer = () => {
    const timer = get()._saveTimer;
    if (timer !== null) {
      window.clearTimeout(timer);
      set({ _saveTimer: null });
    }
  };

  const _doSave = async (): Promise<void> => {
    const { date, content, habits, repository, loadedWithContent, afterSave } =
      get();
    if (!date || !repository) return;

    const isEmpty = isNoteEmpty(content, habits);

    // Guard: never delete a note that was loaded with content
    if (isEmpty && loadedWithContent) {
      set({ isSaving: false, hasEdits: false });
      return;
    }

    const result = isEmpty
      ? await repository.delete(date)
      : await repository.save(date, content, habits);

    // Re-read current state after await
    const current = get();

    if (result.ok) {
      // If the user edited while save was in flight, stay dirty
      if (current.date === date && current.content === content) {
        set({ hasEdits: false, isSaving: false });
      } else {
        set({ isSaving: false });
      }
      afterSave?.({ date, content, isEmpty });
    } else {
      console.error("Failed to save note:", result.error);
      set({ isSaving: false });
    }
  };

  const _scheduleSave = () => {
    _clearSaveTimer();
    const timer = window.setTimeout(() => {
      set({ _saveTimer: null });
      const promise = _doSave();
      set({ _savePromise: promise });
      void promise.finally(() => {
        // Only clear if this is still the active promise
        if (get()._savePromise === promise) {
          set({ _savePromise: null });
        }
      });
    }, SAVE_IDLE_DELAY_MS);
    set({ _saveTimer: timer });
  };

  const _loadNote = async (
    date: string,
    repository: NoteRepository,
  ): Promise<void> => {
    const gen = ++_loadGeneration;
    set({
      status: "loading",
      date,
      content: "",
      habits: undefined,
      hasEdits: false,
      error: null,
      loadedWithContent: false,
      isRefreshing: false,
      hasRefreshedForDate: null,
      remoteCacheResult: null,
    });

    const result = await repository.get(date);
    if (gen !== _loadGeneration) return; // superseded

    if (result.ok) {
      let habits = result.value?.habits;

      // Inherit habit definitions from most recent previous note
      if (!habits || Object.keys(habits).length === 0) {
        const inherited = await findLatestHabitDefinitions(repository, date);
        if (gen !== _loadGeneration) return; // superseded
        habits = inherited;
      }

      const content = result.value?.content ?? "";
      set({
        status: "ready",
        content,
        habits,
        hasEdits: false,
        error: null,
        loadedWithContent: !isContentEmpty(content),
      });

      // Auto-trigger remote refresh + cache check after load
      void get().refreshFromRemote();
      void get().checkRemoteCache();
    } else {
      set({
        status: "error",
        content: "",
        habits: undefined,
        hasEdits: false,
        error: new Error(result.error.message),
      });
    }
  };

  // --- visibility handler ---
  const _handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      void get().flushSave();
    }
  };

  return {
    // Initial state
    status: "idle",
    date: null,
    content: "",
    habits: undefined,
    hasEdits: false,
    error: null,
    loadedWithContent: false,
    isSaving: false,
    _saveTimer: null,
    _savePromise: null,
    isRefreshing: false,
    hasRefreshedForDate: null,
    remoteCacheResult: null,
    repository: null,
    afterSave: null,

    init: (date, repository, afterSave) => {
      document.addEventListener("visibilitychange", _handleVisibilityChange);
      set({ repository, afterSave: afterSave ?? null });
      void _loadNote(date, repository);
    },

    switchNote: async (date) => {
      await get().flushSave();
      const { repository } = get();
      if (!repository) return;
      void _loadNote(date, repository);
    },

    dispose: async () => {
      document.removeEventListener("visibilitychange", _handleVisibilityChange);
      await get().flushSave();
      _loadGeneration++;
      _refreshGeneration++;
      set({
        status: "idle",
        date: null,
        content: "",
        habits: undefined,
        hasEdits: false,
        error: null,
        loadedWithContent: false,
        isSaving: false,
        _saveTimer: null,
        _savePromise: null,
        isRefreshing: false,
        hasRefreshedForDate: null,
        remoteCacheResult: null,
        repository: null,
        afterSave: null,
      });
    },

    setContent: (content) => {
      const { content: current, status } = get();
      if (
        content === current ||
        (status !== "ready" && status !== "error")
      ) {
        return;
      }
      set({ content, hasEdits: true, error: null, isSaving: true });
      _scheduleSave();
    },

    setHabits: (habits) => {
      const { status } = get();
      if (status !== "ready" && status !== "error") return;
      set({ habits, hasEdits: true, error: null, isSaving: true });
      _scheduleSave();
    },

    flushSave: async () => {
      const { _saveTimer, hasEdits, _savePromise } = get();

      // If there's a pending timer, fire the save now
      if (_saveTimer !== null) {
        _clearSaveTimer();
        if (hasEdits) {
          const promise = _doSave();
          set({ _savePromise: promise });
          await promise;
          if (get()._savePromise === promise) {
            set({ _savePromise: null });
          }
          return;
        }
      }

      // If there's an in-flight save, wait for it
      if (_savePromise) {
        await _savePromise;
      }
    },

    applyRemoteUpdate: (content, habits) => {
      const { hasEdits } = get();
      if (hasEdits) return;
      set({
        content,
        habits: habits ?? get().habits,
        hasEdits: false,
        error: null,
      });
    },

    refreshFromRemote: async () => {
      const gen = ++_refreshGeneration;
      const state = get();
      const { date, repository } = state;
      const online = connectivity.getOnline();

      if (
        !date ||
        !repository ||
        !canRefresh(repository) ||
        !online ||
        state.hasRefreshedForDate === date
      ) {
        return;
      }

      if (state.status !== "ready" && state.status !== "error") return;

      set({ isRefreshing: true });

      try {
        const remoteResult = await repository.refreshNote(date);
        if (gen !== _refreshGeneration) return; // superseded

        // Log decryption errors
        if (
          remoteResult &&
          typeof remoteResult === "object" &&
          "ok" in remoteResult &&
          !remoteResult.ok
        ) {
          console.warn(
            "refreshNote returned error for",
            date,
            remoteResult.error,
          );
        }

        const remoteNote = unwrapRefreshResult(remoteResult);
        if (!remoteNote) {
          set({ isRefreshing: false, hasRefreshedForDate: date });
          return;
        }

        // Re-read after await — check pending ops
        if (hasPendingOps(repository)) {
          const hasPending = await repository.hasPendingOp(date);
          if (gen !== _refreshGeneration) return;
          if (hasPending) {
            set({ isRefreshing: false });
            return;
          }
        }

        // Re-read after await — check edits again
        const current = get();
        if (current.hasEdits || current.date !== date) {
          set({ isRefreshing: false });
          return;
        }

        const remoteContent = remoteNote.content ?? "";
        if (remoteContent !== current.content) {
          set({
            content: remoteContent,
            habits: remoteNote.habits ?? current.habits,
            hasEdits: false,
            error: null,
            isRefreshing: false,
            hasRefreshedForDate: date,
          });
        } else {
          set({ isRefreshing: false, hasRefreshedForDate: date });
        }
      } catch (error) {
        console.error("Failed to refresh note from remote:", error);
        if (gen === _refreshGeneration) {
          set({ isRefreshing: false });
        }
      }
    },

    forceRefresh: () => {
      set({ hasRefreshedForDate: null });
      void get().refreshFromRemote();
    },

    checkRemoteCache: async () => {
      const { date, repository } = get();
      const online = connectivity.getOnline();

      if (
        !date ||
        !repository ||
        online ||
        !hasRemoteIndex(repository) ||
        get().content !== "" ||
        get().status !== "ready"
      ) {
        return;
      }

      try {
        const hasRemote = await repository.hasRemoteDateCached(date);
        // Re-read after await
        const current = get();
        if (current.date === date) {
          set({ remoteCacheResult: { date, hasRemote } });
        }
      } catch (error) {
        console.error("Failed to check remote date cache:", error);
      }
    },

    setAfterSave: (callback) => {
      set({ afterSave: callback ?? null });
    },
  };
});
