import { createStore } from "zustand/vanilla";
import type { NoteRepository } from "../storage/noteRepository";
import type { RepositoryError } from "../domain/errors";
import type { Result } from "../domain/result";
import { connectivity } from "../services/connectivity";

interface YearDateRepository {
  getAllDatesForYear: (
    year: number,
  ) => Promise<Result<string[], RepositoryError>>;
}

interface LocalDateRepository {
  getAllLocalDates: () => Promise<Result<string[], RepositoryError>>;
  getAllLocalDatesForYear: (
    year: number,
  ) => Promise<Result<string[], RepositoryError>>;
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

const DEBOUNCE_MS = 400;

export interface NoteDatesState {
  noteDates: Set<string>;
  year: number;
  repository: NoteRepository | null;
  online: boolean;
  isRefreshing: boolean;
  _refreshTimer: number | null;
  _refreshGeneration: number;

  // Actions
  init: (repository: NoteRepository, year: number) => void;
  dispose: () => void;
  setYear: (year: number) => void;
  updateConnectivity: (online: boolean) => void;
  refresh: (options?: { immediate?: boolean }) => void;
  applyNoteChange: (date: string, isEmpty: boolean) => void;
  hasNote: (date: string) => boolean;
  updateRepository: (repository: NoteRepository | null) => void;
}

export const noteDatesStore = createStore<NoteDatesState>()((set, get) => {
  let _refreshGeneration = 0;

  const _clearRefreshTimer = () => {
    const timer = get()._refreshTimer;
    if (timer !== null) {
      window.clearTimeout(timer);
      set({ _refreshTimer: null });
    }
  };

  const _doRefresh = async () => {
    const gen = ++_refreshGeneration;
    const { repository, year } = get();
    const online = connectivity.getOnline();

    if (!repository) {
      set({ noteDates: new Set(), isRefreshing: false });
      return;
    }

    set({ isRefreshing: true });

    // Load local dates first (instant)
    let hasLocalSnapshot = false;
    if (supportsLocalDates(repository)) {
      const localResult = supportsYearDates(repository)
        ? await repository.getAllLocalDatesForYear(year)
        : await repository.getAllLocalDates();
      if (gen !== _refreshGeneration) return; // superseded
      if (localResult.ok) {
        hasLocalSnapshot = true;
        set({ noteDates: new Set(localResult.value) });
      } else {
        set({ noteDates: new Set() });
      }
    }

    // Refresh from remote if online
    if (online && supportsDateRefresh(repository)) {
      await repository.refreshDates(year);
      if (gen !== _refreshGeneration) return; // superseded
    }

    // Load full dates (local + remote merged)
    const datesResult = supportsYearDates(repository)
      ? await repository.getAllDatesForYear(year)
      : await repository.getAllDates();

    if (gen !== _refreshGeneration) return; // superseded

    if (datesResult.ok) {
      set({ noteDates: new Set(datesResult.value) });
    } else if (!hasLocalSnapshot) {
      set({ noteDates: new Set() });
    }

    set({ isRefreshing: false });
  };

  return {
    // Initial state
    noteDates: new Set<string>(),
    year: new Date().getFullYear(),
    repository: null,
    online: connectivity.getOnline(),
    isRefreshing: false,
    _refreshTimer: null,
    _refreshGeneration: 0,

    init: (repository, year) => {
      set({ repository, year });
      void _doRefresh();
    },

    dispose: () => {
      _clearRefreshTimer();
      _refreshGeneration++;
      set({
        repository: null,
        noteDates: new Set(),
        isRefreshing: false,
        _refreshTimer: null,
      });
    },

    setYear: (year) => {
      const current = get();
      if (current.year === year) return;
      set({ year });
      _clearRefreshTimer();
      void _doRefresh();
    },

    updateConnectivity: (online) => {
      const prev = get();
      set({ online });
      if (online && !prev.online && prev.repository) {
        // Coming online — refresh
        void _doRefresh();
      }
    },

    updateRepository: (repository) => {
      const current = get();
      if (repository === current.repository) return;
      set({ repository });
      if (repository) {
        _clearRefreshTimer();
        void _doRefresh();
      }
    },

    refresh: (options) => {
      _clearRefreshTimer();
      if (options?.immediate) {
        void _doRefresh();
        return;
      }
      // Debounce
      const timer = window.setTimeout(() => {
        set({ _refreshTimer: null });
        void _doRefresh();
      }, DEBOUNCE_MS);
      set({ _refreshTimer: timer });
    },

    applyNoteChange: (date, isEmpty) => {
      const { noteDates } = get();
      const nextDates = new Set(noteDates);
      if (isEmpty) {
        nextDates.delete(date);
      } else {
        nextDates.add(date);
      }
      set({ noteDates: nextDates });
    },

    hasNote: (date) => {
      return get().noteDates.has(date);
    },
  };
});
