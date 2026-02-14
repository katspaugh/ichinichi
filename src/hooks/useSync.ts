import { useCallback, useEffect } from "react";
import { useMachine } from "@xstate/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SyncStatus } from "../types";
import type { UnifiedSyncedNoteRepository } from "../domain/notes/hydratingSyncedNoteRepository";
import type { PendingOpsSummary } from "../domain/sync";
import { useConnectivity } from "./useConnectivity";
import { syncMachine } from "./useSyncMachine";

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
}

export function useSync(
  repository: UnifiedSyncedNoteRepository | null,
  options?: {
    enabled?: boolean;
    userId?: string | null;
    supabase?: SupabaseClient | null;
  },
): UseSyncReturn {
  const online = useConnectivity();
  const syncEnabled = options?.enabled ?? !!repository;
  const userId = options?.userId ?? null;
  const supabase = options?.supabase ?? null;
  const [state, send] = useMachine(syncMachine);

  useEffect(() => {
    send({
      type: "INPUTS_CHANGED",
      repository,
      enabled: syncEnabled,
      online,
      userId,
      supabase,
    });
  }, [send, repository, syncEnabled, online, userId, supabase]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        send({ type: "WINDOW_FOCUSED" });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [send]);

  const triggerSync = useCallback(
    (options?: { immediate?: boolean }) => {
      send({ type: "REQUEST_SYNC", immediate: Boolean(options?.immediate) });
    },
    [send],
  );

  const queueIdleSync = useCallback(
    (options?: { delayMs?: number }) => {
      send({ type: "REQUEST_IDLE_SYNC", delayMs: options?.delayMs });
    },
    [send],
  );

  const clearRealtimeChanged = useCallback(() => {
    send({ type: "CLEAR_REALTIME_CHANGED" });
  }, [send]);

  return {
    syncStatus: state.context.status,
    syncError: state.context.syncError,
    lastSynced: state.context.lastSynced,
    triggerSync,
    queueIdleSync,
    pendingOps: state.context.pendingOps,
    realtimeConnected: state.context.realtimeConnected,
    lastRealtimeChangedDate: state.context.lastRealtimeChangedDate,
    clearRealtimeChanged,
  };
}
