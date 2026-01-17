import { useCallback, useEffect } from "react";
import { useMachine } from "@xstate/react";
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
}

export function useSync(
  repository: UnifiedSyncedNoteRepository | null,
  options?: { enabled?: boolean },
): UseSyncReturn {
  const online = useConnectivity();
  const syncEnabled = options?.enabled ?? !!repository;
  const [state, send] = useMachine(syncMachine);

  useEffect(() => {
    send({
      type: "INPUTS_CHANGED",
      repository,
      enabled: syncEnabled,
      online,
    });
  }, [send, repository, syncEnabled, online]);

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

  return {
    syncStatus: state.context.status,
    syncError: state.context.syncError,
    lastSynced: state.context.lastSynced,
    triggerSync,
    queueIdleSync,
    pendingOps: state.context.pendingOps,
  };
}
