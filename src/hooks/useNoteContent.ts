import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { NoteRepository } from "../storage/noteRepository";
import {
  noteContentStore as store,
  type SaveSnapshot,
  type NoteContentState as StoreState,
  type NoteContentStore,
} from "../stores/noteContentStore";
import type { RepositoryError } from "../domain/errors";

export type { SaveSnapshot };

export interface UseNoteContentReturn {
  content: string;
  setContent: (content: string) => void;
  isDecrypting: boolean;
  hasEdits: boolean;
  isSaving: boolean;
  isContentReady: boolean;
  error: RepositoryError | null;
  saveError: RepositoryError | null;
}

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

export function useNoteContent(
  date: string | null,
  repository: NoteRepository | null,
  onAfterSave?: (snapshot: SaveSnapshot) => void,
): UseNoteContentReturn {
  const prevDateRef = useRef<string | null>(null);
  const prevRepoRef = useRef<NoteRepository | null>(null);

  // Keep afterSave callback in sync
  useEffect(() => {
    store.getState().setAfterSave(onAfterSave);
  }, [onAfterSave]);

  // Init / switchNote / dispose lifecycle
  useEffect(() => {
    if (!date || !repository) {
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
      store.getState().init(date, repository, onAfterSave);
    } else if (dateChanged) {
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

  const content = useStoreSelector(store, (s) => s.content);
  const hasEdits = useStoreSelector(store, (s) => s.hasEdits);
  const isSaving = useStoreSelector(store, (s) => s.isSaving);
  const status = useStoreSelector(store, (s) => s.status);
  const error = useStoreSelector(store, (s) => s.error);
  const saveError = useStoreSelector(store, (s) => s.saveError);

  const isReady = status === "ready" || status === "error";
  const isLoading =
    status === "loading" || (date !== null && repository === null);

  const setContent = useCallback(
    (newContent: string) => store.getState().setContent(newContent),
    [],
  );

  return {
    content,
    setContent,
    isDecrypting: isLoading,
    hasEdits,
    isSaving,
    isContentReady: isReady,
    error,
    saveError,
  };
}
