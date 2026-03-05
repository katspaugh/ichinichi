import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { NoteRepository } from "../storage/noteRepository";
import { useConnectivity } from "./useConnectivity";
import {
  createNoteDatesStore,
  type NoteDatesState,
  type NoteDatesStore,
} from "../stores/noteDatesStore";

interface UseNoteDatesReturn {
  hasNote: (date: string) => boolean;
  noteDates: Set<string>;
  refreshNoteDates: (options?: { immediate?: boolean }) => void;
  applyNoteChange: (date: string, isEmpty: boolean) => void;
}

function useStoreSel<T>(
  store: NoteDatesStore,
  selector: (state: NoteDatesState) => T,
): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

export function useNoteDates(
  repository: NoteRepository | null,
  year: number,
): UseNoteDatesReturn {
  const online = useConnectivity();
  const storeRef = useRef<NoteDatesStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createNoteDatesStore();
  }
  const store = storeRef.current;
  const prevRepoRef = useRef<NoteRepository | null>(null);

  // Init / update lifecycle
  useEffect(() => {
    const repoChanged = repository !== prevRepoRef.current;
    prevRepoRef.current = repository;

    if (!repository) {
      store.getState().dispose();
      return;
    }

    if (repoChanged) {
      store.getState().init(repository, year);
    } else {
      store.getState().setYear(year);
    }

    return () => {
      store.getState().dispose();
      prevRepoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, year]);

  // Connectivity changes
  useEffect(() => {
    store.getState().updateConnectivity(online);
  }, [online, store]);

  const noteDates = useStoreSel(store, (s) => s.noteDates);

  const refreshNoteDates = useCallback(
    (options?: { immediate?: boolean }) => {
      store.getState().refresh(options);
    },
    [store],
  );

  const applyNoteChange = useCallback(
    (date: string, isEmpty: boolean) => {
      store.getState().applyNoteChange(date, isEmpty);
    },
    [store],
  );

  const hasNote = useCallback(
    (checkDate: string): boolean => noteDates.has(checkDate),
    [noteDates],
  );

  return {
    hasNote,
    noteDates,
    refreshNoteDates,
    applyNoteChange,
  };
}
