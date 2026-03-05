import { createStore } from "zustand/vanilla";
import {
  isSyncCapableNoteRepository,
  type NoteRepository,
} from "../storage/noteRepository";
import { isNoteEmpty, isContentEmpty } from "../utils/sanitize";
import { connectivity } from "../services/connectivity";

export interface SaveSnapshot {
  date: string;
  content: string;
  isEmpty: boolean;
}

const SAVE_IDLE_DELAY_MS = 2000;

export interface NoteContentState {
  // Core note
  status: "idle" | "loading" | "ready" | "error";
  date: string | null;
  content: string;
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
  flushSave: () => Promise<void>;
  applyRemoteUpdate: (content: string) => void;
  refreshFromRemote: () => Promise<void>;
  forceRefresh: () => void;
  checkRemoteCache: () => Promise<void>;
  setAfterSave: (callback?: (snapshot: SaveSnapshot) => void) => void;
}

export const noteContentStore = createStore<NoteContentState>()((set, get) => {
  // --- internal helpers ---

  let _loadGeneration = 0;
  let _refreshGeneration = 0;
  let _disposeGeneration = 0;

  const _clearSaveTimer = () => {
    const timer = get()._saveTimer;
    if (timer !== null) {
      window.clearTimeout(timer);
      set({ _saveTimer: null });
    }
  };

  const _doSave = async (): Promise<void> => {
    const { date, content, repository, loadedWithContent } = get();
    if (!date || !repository) return;

    const isEmpty = isNoteEmpty(content);

    // Guard: never delete a note that was loaded with content
    if (isEmpty && loadedWithContent) {
      set({ isSaving: false, hasEdits: false });
      return;
    }

    const result = isEmpty
      ? await repository.delete(date)
      : await repository.save(date, content);

    // Re-read current state after await
    const current = get();

    if (result.ok) {
      // Only clear dirty state if content hasn't changed AND no new save is pending
      if (
        current.date === date &&
        current.content === content &&
        current._saveTimer === null
      ) {
        set({ hasEdits: false, isSaving: false });
      } else if (current._saveTimer === null) {
        // Content changed but no new save scheduled
        set({ isSaving: false });
      }
      // else: new save timer pending — leave isSaving true

      // Re-read afterSave after await to avoid calling a stale/disposed callback
      current.afterSave?.({ date, content, isEmpty });
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
      const content = result.value?.content ?? "";
      set({
        status: "ready",
        content,
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
      // Cancel any in-flight dispose to prevent it from clobbering this init
      _disposeGeneration++;
      // Remove previous listener to avoid duplicates on re-init
      document.removeEventListener("visibilitychange", _handleVisibilityChange);
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
      const disposeGen = ++_disposeGeneration;
      document.removeEventListener("visibilitychange", _handleVisibilityChange);
      await get().flushSave();
      // If init() was called while we were flushing, abort — the new
      // init owns the store now and our reset would clobber its state.
      if (disposeGen !== _disposeGeneration) return;
      _loadGeneration++;
      _refreshGeneration++;
      set({
        status: "idle",
        date: null,
        content: "",
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

    applyRemoteUpdate: (content) => {
      const { hasEdits } = get();
      if (hasEdits) return;
      set({
        content,
        hasEdits: false,
        error: null,
      });
    },

    refreshFromRemote: async () => {
      const gen = ++_refreshGeneration;
      const state = get();
      const { date, repository } = state;
      const online = connectivity.getOnline();
      const syncRepository = isSyncCapableNoteRepository(repository)
        ? repository
        : null;

      if (
        !date ||
        !syncRepository ||
        !online ||
        state.hasRefreshedForDate === date
      ) {
        return;
      }

      if (state.status !== "ready" && state.status !== "error") return;

      set({ isRefreshing: true });

      try {
        const remoteResult = await syncRepository.refreshNote(date);
        if (gen !== _refreshGeneration) return; // superseded

        if (!remoteResult.ok) {
          console.warn(
            "refreshNote returned error for",
            date,
            remoteResult.error,
          );
          set({ isRefreshing: false, hasRefreshedForDate: date });
          return;
        }

        const remoteNote = remoteResult.value;
        if (!remoteNote) {
          set({ isRefreshing: false, hasRefreshedForDate: date });
          return;
        }

        // Re-read after await — check pending ops
        const hasPending = await syncRepository.hasPendingOp(date);
        if (gen !== _refreshGeneration) return;
        if (hasPending) {
          set({ isRefreshing: false });
          return;
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
      const syncRepository = isSyncCapableNoteRepository(repository)
        ? repository
        : null;

      if (
        !date ||
        !syncRepository ||
        online ||
        get().content !== "" ||
        get().status !== "ready"
      ) {
        return;
      }

      try {
        const hasRemote = await syncRepository.hasRemoteDateCached(date);
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
