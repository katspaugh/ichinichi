import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteRepository } from "../storage/noteRepository";
import { useConnectivity } from "./useConnectivity";

interface UseNoteDatesReturn {
  hasNote: (date: string) => boolean;
  noteDates: Set<string>;
  refreshNoteDates: (options?: { immediate?: boolean }) => void;
}

interface YearDateRepository {
  getAllDatesForYear: (year: number) => Promise<string[]>;
}

interface LocalDateRepository {
  getAllLocalDates: () => Promise<string[]>;
  getAllLocalDatesForYear: (year: number) => Promise<string[]>;
}

interface RefreshableDateRepository {
  refreshDates: (year: number) => Promise<void>;
}

function supportsYearDates(
  repository: NoteRepository | null,
): repository is NoteRepository & YearDateRepository {
  return !!repository && "getAllDatesForYear" in repository;
}

function supportsLocalDates(
  repository: NoteRepository | null,
): repository is NoteRepository & LocalDateRepository {
  return !!repository && "getAllLocalDates" in repository;
}

function supportsDateRefresh(
  repository: NoteRepository | null,
): repository is NoteRepository & RefreshableDateRepository {
  return !!repository && "refreshDates" in repository;
}

export function useNoteDates(
  repository: NoteRepository | null,
  year: number,
): UseNoteDatesReturn {
  const [noteDates, setNoteDates] = useState<Set<string>>(new Set());
  const online = useConnectivity();
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runRefreshRef = useRef<() => void>(() => {});
  const wasOfflineRef = useRef(!online);

  const runRefresh = useCallback(() => {
    // Skip if already refreshing - don't queue for later since repository-level
    // deduplication handles the network call, and re-queuing causes extra requests
    if (refreshInFlightRef.current) {
      return;
    }
    const refreshPromise = (async () => {
      if (!repository) {
        setNoteDates(new Set());
        return;
      }

      let hasLocalSnapshot = false;
      if (supportsLocalDates(repository)) {
        try {
          const localDates = supportsYearDates(repository)
            ? await repository.getAllLocalDatesForYear(year)
            : await repository.getAllLocalDates();
          hasLocalSnapshot = true;
          setNoteDates(new Set(localDates));
        } catch {
          setNoteDates(new Set());
        }
      }

      if (online && supportsDateRefresh(repository)) {
        await repository.refreshDates(year);
      }

      try {
        const dates = supportsYearDates(repository)
          ? await repository.getAllDatesForYear(year)
          : await repository.getAllDates();
        setNoteDates(new Set(dates));
      } catch {
        if (!hasLocalSnapshot) {
          setNoteDates(new Set());
        }
      }
    })().finally(() => {
      refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = refreshPromise;
  }, [repository, year, online]);

  const refreshNoteDates = useCallback(
    (options?: { immediate?: boolean }) => {
      if (options?.immediate) {
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
          refreshTimeoutRef.current = null;
        }
        runRefresh();
        return;
      }

      if (refreshTimeoutRef.current) {
        return;
      }

      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        runRefresh();
      }, 400);
    },
    [runRefresh],
  );

  useEffect(() => {
    runRefreshRef.current = runRefresh;
  }, [runRefresh]);

  useEffect(() => {
    refreshNoteDates({ immediate: true });
  }, [refreshNoteDates]);

  // Refresh dates only when coming back online from offline
  // Use runRefreshRef to avoid depending on refreshNoteDates which would cause duplicate calls
  useEffect(() => {
    if (online && wasOfflineRef.current) {
      runRefreshRef.current();
    }
    wasOfflineRef.current = !online;
  }, [online]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, [repository, year]);

  const hasNote = useCallback(
    (checkDate: string): boolean => {
      return noteDates.has(checkDate);
    },
    [noteDates],
  );

  return {
    hasNote,
    noteDates,
    refreshNoteDates,
  };
}
