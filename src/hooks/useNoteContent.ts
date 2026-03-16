import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { NoteRepository } from "../storage/noteRepository";
import { useConnectivity } from "./useConnectivity";
import {
  type SaveSnapshot,
  type NoteContentState as StoreState,
  type NoteContentStore,
} from "../stores/noteContentStore";
import type { RepositoryError } from "../domain/errors";
import { useServiceContext } from "../contexts/serviceContext";

export type { SaveSnapshot };

export interface UseNoteContentReturn {
  content: string;
  setContent: (content: string) => void;
  isDecrypting: boolean;
  hasEdits: boolean;
  /** True when the note is being saved (dirty or saving state) */
  isSaving: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
  isSoftDeleted: boolean;
  /** Error from loading/decrypting the note (e.g. DecryptFailed) */
  error: RepositoryError | null;
  /** Error from the last failed save attempt */
  saveError: RepositoryError | null;
  /** Force a refresh from remote (used for realtime updates) */
  forceRefresh: () => void;
  restoreNote: () => void;
}

// Zustand selectors for fine-grained re-renders
function useStoreSelector<T>(
  store: NoteContentStore,
  selector: (state: StoreState) => T,
): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
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
  const { noteContentStore: store } = useServiceContext();

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
  const content = useStoreSelector(store, (s) => s.content);
  const hasEdits = useStoreSelector(store, (s) => s.hasEdits);
  const isSaving = useStoreSelector(store, (s) => s.isSaving);
  const status = useStoreSelector(store, (s) => s.status);
  const error = useStoreSelector(store, (s) => s.error);
  const saveError = useStoreSelector(store, (s) => s.saveError);
  const remoteCacheResult = useStoreSelector(store, (s) => s.remoteCacheResult);
  const isSoftDeleted = useStoreSelector(store, (s) => s.isSoftDeleted);

  const isReady =
    status === "ready" || status === "error";
  // Treat "date set but no repository yet" as loading so the editor
  // shows "Decrypting..." while the vault is still unlocking.
  const isLoading =
    status === "loading" || (date !== null && repository === null);

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
  const forceRefresh = useCallback(
    () => store.getState().forceRefresh(),
    [store],
  );
  const restoreNote = useCallback(
    () => store.getState().restoreNote(),
    [store],
  );

  return {
    content,
    setContent,
    isDecrypting: isLoading,
    hasEdits,
    isSaving,
    isContentReady: isReady,
    isOfflineStub,
    isSoftDeleted,
    error,
    saveError,
    forceRefresh,
    restoreNote,
  };
}
