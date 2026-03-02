import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SyncStatus } from "../types";
import type { UnifiedSyncedNoteRepository } from "../domain/notes/hydratingSyncedNoteRepository";
import type { PendingOpsSummary } from "../domain/sync";
import { syncStore } from "../stores/syncStore";

interface UseSyncReturn {
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSynced: Date | null;
  triggerSync: (options?: { immediate?: boolean }) => void;
  queueIdleSync: (options?: { delayMs?: number }) => void;
  pendingOps: PendingOpsSummary;
  realtimeConnected: boolean;
  /** Date of the last note changed via realtime subscription */
  lastRealtimeChangedDate: string | null;
  /** Clear the lastRealtimeChangedDate after consuming it */
  clearRealtimeChanged: () => void;
  /** Monotonically increasing counter of completed syncs */
  syncCompletionCount: number;
}

function useStoreSel<T>(selector: (state: ReturnType<typeof syncStore.getState>) => T): T {
  return useSyncExternalStore(
    syncStore.subscribe,
    () => selector(syncStore.getState()),
    () => selector(syncStore.getState()),
  );
}

export function useSync(
  repository: UnifiedSyncedNoteRepository | null,
  options?: {
    enabled?: boolean;
    userId?: string | null;
    supabase?: SupabaseClient | null;
  },
): UseSyncReturn {
  const syncEnabled = options?.enabled ?? !!repository;
  const userId = options?.userId ?? null;
  const supabase = options?.supabase ?? null;

  const prevRepoRef = useRef<UnifiedSyncedNoteRepository | null>(null);
  const prevEnabledRef = useRef(false);

  useEffect(() => {
    const repoChanged = repository !== prevRepoRef.current;
    const enabledChanged = syncEnabled !== prevEnabledRef.current;
    prevRepoRef.current = repository;
    prevEnabledRef.current = syncEnabled;

    if (syncEnabled && repository && userId && supabase) {
      if (repoChanged || enabledChanged) {
        syncStore.getState().init({ repository, userId, supabase });
      }
    } else {
      // Disable
      if (!syncStore.getState()._disposed) {
        syncStore.getState().dispose();
      }
    }

    return () => {
      if (!syncStore.getState()._disposed) {
        syncStore.getState().dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, syncEnabled, userId, supabase]);

  const syncStatus = useStoreSel((s) => s.status);
  const syncError = useStoreSel((s) => s.syncError);
  const lastSynced = useStoreSel((s) => s.lastSynced);
  const pendingOps = useStoreSel((s) => s.pendingOps);
  const realtimeConnected = useStoreSel((s) => s.realtimeConnected);
  const lastRealtimeChangedDate = useStoreSel((s) => s.lastRealtimeChangedDate);
  const syncCompletionCount = useStoreSel((s) => s.syncCompletionCount);

  const triggerSync = useCallback(
    (opts?: { immediate?: boolean }) => {
      syncStore.getState().requestSync(opts);
    },
    [],
  );

  const queueIdleSync = useCallback(
    (opts?: { delayMs?: number }) => {
      syncStore.getState().queueIdleSync(opts);
    },
    [],
  );

  const clearRealtimeChanged = useCallback(() => {
    syncStore.getState().clearRealtimeChanged();
  }, []);

  return {
    syncStatus,
    syncError,
    lastSynced,
    triggerSync,
    queueIdleSync,
    pendingOps,
    realtimeConnected,
    lastRealtimeChangedDate,
    clearRealtimeChanged,
    syncCompletionCount,
  };
}
