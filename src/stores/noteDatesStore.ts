import { createStore } from "zustand/vanilla";
import {
  isSyncCapableNoteRepository,
  type NoteRepository,
} from "../storage/noteRepository";
import { connectivity } from "../services/connectivity";

const DEBOUNCE_MS = 400;

export interface NoteDatesState {
  noteDates: Set<string>;
  year: number;
  repository: NoteRepository | null;
  online: boolean;
  isRefreshing: boolean;
  _refreshTimer: number | null;
  _refreshGeneration: number;
  _disposed: boolean;

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

export function createNoteDatesStore() {
  return createStore<NoteDatesState>()((set, get) => {
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
      const syncRepository = isSyncCapableNoteRepository(repository)
        ? repository
        : null;

      if (!repository || get()._disposed) {
        set({ noteDates: new Set(), isRefreshing: false });
        return;
      }

      set({ isRefreshing: true });

      // Load local dates first (instant)
      let hasLocalSnapshot = false;
      if (syncRepository) {
        const localResult = await syncRepository.getAllLocalDatesForYear(year);
        if (gen !== _refreshGeneration || get()._disposed) return; // superseded or disposed
        if (localResult.ok) {
          hasLocalSnapshot = true;
          set({ noteDates: new Set(localResult.value) });
        } else {
          set({ noteDates: new Set() });
        }
      }

      // Refresh from remote if online
      if (online && syncRepository) {
        await syncRepository.refreshDates(year);
        if (gen !== _refreshGeneration || get()._disposed) return; // superseded or disposed
      }

      // Load full dates (local + remote merged)
      const datesResult = await repository.getAllDatesForYear(year);

      if (gen !== _refreshGeneration || get()._disposed) return; // superseded or disposed

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
      _disposed: true,

      init: (repository, year) => {
        set({ repository, year, _disposed: false });
        void _doRefresh();
      },

      dispose: () => {
        _clearRefreshTimer();
        _refreshGeneration++;
        set({
          repository: null,
          // Preserve noteDates to avoid flash — next init/refresh will replace them
          isRefreshing: false,
          _refreshTimer: null,
          _disposed: true,
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
}

export type NoteDatesStore = ReturnType<typeof createNoteDatesStore>;
