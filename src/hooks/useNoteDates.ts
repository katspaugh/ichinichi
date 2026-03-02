import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { NoteRepository } from "../storage/noteRepository";
import { useConnectivity } from "./useConnectivity";
import { noteDatesStore } from "../stores/noteDatesStore";

interface UseNoteDatesReturn {
  hasNote: (date: string) => boolean;
  noteDates: Set<string>;
  refreshNoteDates: (options?: { immediate?: boolean }) => void;
  applyNoteChange: (date: string, isEmpty: boolean) => void;
}

function useStoreSel<T>(selector: (state: ReturnType<typeof noteDatesStore.getState>) => T): T {
  return useSyncExternalStore(
    noteDatesStore.subscribe,
    () => selector(noteDatesStore.getState()),
    () => selector(noteDatesStore.getState()),
  );
}

export function useNoteDates(
  repository: NoteRepository | null,
  year: number,
): UseNoteDatesReturn {
  const online = useConnectivity();
  const store = noteDatesStore;
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

  const noteDates = useStoreSel((s) => s.noteDates);

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
