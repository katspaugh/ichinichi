import { createStore } from "zustand/vanilla";
import type { NoteRepository } from "../storage/noteRepository";
import { isNoteEmpty, isContentEmpty } from "../utils/sanitize";
import { connectivity as defaultConnectivity } from "../services/connectivity";
import type { RepositoryError } from "../domain/errors";
import { reportError } from "../utils/errorReporter";

export interface ConnectivitySource {
  getOnline(): boolean;
}

export interface SaveSnapshot {
  date: string;
  content: string;
  isEmpty: boolean;
}

const SAVE_IDLE_DELAY_MS = 500;

export interface NoteContentState {
  status: "idle" | "loading" | "ready" | "error";
  date: string | null;
  content: string;
  hasEdits: boolean;
  error: RepositoryError | null;
  loadedWithContent: boolean;

  isSaving: boolean;
  saveError: RepositoryError | null;
  _saveTimer: number | null;
  _savePromise: Promise<void> | null;

  repository: NoteRepository | null;
  afterSave: ((snapshot: SaveSnapshot) => void) | null;

  init(
    date: string,
    repository: NoteRepository,
    afterSave?: (snapshot: SaveSnapshot) => void,
    connectivityOverride?: ConnectivitySource,
  ): void;
  switchNote(date: string): Promise<void>;
  dispose(): Promise<void>;
  setContent(content: string): void;
  flushSave(): Promise<void>;
  reloadFromLocal(): Promise<void>;
  setAfterSave(callback?: (snapshot: SaveSnapshot) => void): void;
}

export function createNoteContentStore(deps?: { connectivity?: ConnectivitySource }) {
  const defaultConn = deps?.connectivity ?? defaultConnectivity;

  return createStore<NoteContentState>()((set, get) => {
    let _loadGeneration = 0;
    let _disposeGeneration = 0;
    let _contentVersion = 0;
    let _connectivity: ConnectivitySource = defaultConn;

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

      const current = get();

      if (result.ok) {
        if (
          current.date === date &&
          current.content === content &&
          current._saveTimer === null
        ) {
          set({ hasEdits: false, isSaving: false });
        } else if (current._saveTimer === null) {
          set({ isSaving: false });
        }

        if (current.saveError) set({ saveError: null });
        current.afterSave?.({ date, content, isEmpty });
      } else {
        set({ isSaving: false, saveError: result.error });
      }
    };

    const _scheduleSave = () => {
      _clearSaveTimer();
      const timer = window.setTimeout(() => {
        set({ _saveTimer: null, isSaving: true });
        const promise = _doSave();
        set({ _savePromise: promise });
        void promise.finally(() => {
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
      });

      const result = await repository.get(date);
      if (gen !== _loadGeneration) return;

      if (result.ok) {
        const content = result.value?.content ?? "";
        set({
          status: "ready",
          content,
          hasEdits: false,
          error: null,
          loadedWithContent: !isContentEmpty(content),
        });
      } else {
        set({
          status: "error",
          content: "",
          hasEdits: false,
          error: result.error,
        });
      }
    };

    const _handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void get().flushSave();
      }
    };

    return {
      status: "idle",
      date: null,
      content: "",
      hasEdits: false,
      error: null,
      loadedWithContent: false,
      isSaving: false,
      saveError: null,
      _saveTimer: null,
      _savePromise: null,
      repository: null,
      afterSave: null,

      init: (date, repository, afterSave, connectivityOverride) => {
        _disposeGeneration++;
        _connectivity = connectivityOverride ?? defaultConn;
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
        _loadGeneration++;
        document.removeEventListener("visibilitychange", _handleVisibilityChange);
        await get().flushSave();
        if (disposeGen !== _disposeGeneration) return;
        set({
          status: "idle",
          date: null,
          content: "",
          hasEdits: false,
          error: null,
          saveError: null,
          loadedWithContent: false,
          isSaving: false,
          _saveTimer: null,
          _savePromise: null,
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
        // Read-only when offline
        if (!_connectivity.getOnline()) return;

        _contentVersion++;
        set({ content, hasEdits: true, error: null });
        _scheduleSave();
      },

      flushSave: async () => {
        const { _saveTimer, hasEdits, _savePromise } = get();

        if (_saveTimer !== null) {
          _clearSaveTimer();
          if (hasEdits) {
            set({ isSaving: true });
            const promise = _doSave();
            set({ _savePromise: promise });
            await promise;
            if (get()._savePromise === promise) {
              set({ _savePromise: null });
            }
            return;
          }
        }

        if (_savePromise) {
          await _savePromise;
        }
      },

      reloadFromLocal: async () => {
        const { date, repository, hasEdits } = get();
        if (!date || !repository || hasEdits) return;
        const versionAtStart = _contentVersion;
        try {
          const result = await repository.get(date);
          const current = get();
          if (current.date !== date || current.hasEdits) return;
          if (_contentVersion !== versionAtStart) return;
          if (result.ok) {
            const content = result.value?.content ?? "";
            if (content !== current.content) {
              set({ content, hasEdits: false, error: null });
            }
          }
        } catch (error) {
          reportError("noteContentStore.reloadFromLocal", error);
        }
      },

      setAfterSave: (callback) => {
        set({ afterSave: callback ?? null });
      },
    };
  });
}

export type NoteContentStore = ReturnType<typeof createNoteContentStore>;

export const noteContentStore = createNoteContentStore();
