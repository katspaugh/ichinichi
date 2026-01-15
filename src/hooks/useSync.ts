import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { SyncStatus } from "../types";
import type { UnifiedSyncedNoteRepository } from "../domain/notes/hydratingSyncedNoteRepository";
import type { PendingOpsSummary, SyncService } from "../domain/sync";
import {
  createSyncIntentScheduler,
  createSyncService,
  getPendingOpsSummary,
} from "../domain/sync";
import {
  initialSyncMachineState,
  syncMachineReducer,
  type SyncMachineInputs,
} from "../domain/sync/stateMachine";
import { useConnectivity } from "./useConnectivity";
import { pendingOpsSource } from "../storage/pendingOpsSource";
import { formatSyncError } from "../utils/syncError";

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
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingOps, setPendingOps] = useState<PendingOpsSummary>({
    notes: 0,
    images: 0,
    total: 0,
  });
  const syncServiceRef = useRef<SyncService | null>(null);
  const intentSchedulerRef = useRef<ReturnType<typeof createSyncIntentScheduler> | null>(null);
  const pendingPollRef = useRef<number | null>(null);
  const online = useConnectivity();
  const syncEnabled = options?.enabled ?? !!repository;
  const [state, dispatch] = useReducer(
    syncMachineReducer,
    initialSyncMachineState,
  );
  const statePhaseRef = useRef(state.phase);
  const inputs: SyncMachineInputs = useMemo(
    () => ({
      enabled: syncEnabled && !!repository,
      online,
    }),
    [syncEnabled, repository, online],
  );

  const refreshPendingOps = useCallback(async () => {
    try {
      const summary = await getPendingOpsSummary(pendingOpsSource);
      setPendingOps(summary);
    } catch {
      setPendingOps({ notes: 0, images: 0, total: 0 });
    }
  }, []);

  useEffect(() => {
    dispatch({ type: "INPUTS_CHANGED", inputs });
  }, [inputs]);

  useEffect(() => {
    if (!repository || !syncEnabled) {
      if (syncServiceRef.current) {
        syncServiceRef.current.dispose();
        syncServiceRef.current = null;
      }
      if (intentSchedulerRef.current) {
        intentSchedulerRef.current.dispose();
        intentSchedulerRef.current = null;
      }
      if (pendingPollRef.current) {
        window.clearInterval(pendingPollRef.current);
        pendingPollRef.current = null;
      }
      window.setTimeout(() => {
        setPendingOps({ notes: 0, images: 0, total: 0 });
      }, 0);
      return;
    }

    if (syncServiceRef.current) {
      syncServiceRef.current.dispose();
    }
    syncServiceRef.current = createSyncService(repository, pendingOpsSource, {
      onSyncStart: () => dispatch({ type: "SYNC_STARTED" }),
      onSyncComplete: (status) => {
        setSyncError(null);
        dispatch({ type: "SYNC_FINISHED", status });
      },
      onSyncError: (error) => {
        setSyncError(formatSyncError(error));
        dispatch({ type: "SYNC_FINISHED", status: SyncStatus.Error });
      },
    });
    if (intentSchedulerRef.current) {
      intentSchedulerRef.current.dispose();
    }
    intentSchedulerRef.current = createSyncIntentScheduler(
      dispatch,
      pendingOpsSource,
    );
    window.setTimeout(() => {
      void refreshPendingOps();
    }, 0);

    if (!pendingPollRef.current) {
      pendingPollRef.current = window.setInterval(() => {
        void refreshPendingOps();
      }, 5000);
    }

    return () => {
      if (syncServiceRef.current) {
        syncServiceRef.current.dispose();
        syncServiceRef.current = null;
      }
      if (intentSchedulerRef.current) {
        intentSchedulerRef.current.dispose();
        intentSchedulerRef.current = null;
      }
      if (pendingPollRef.current) {
        window.clearInterval(pendingPollRef.current);
        pendingPollRef.current = null;
      }
    };
  }, [repository, syncEnabled, refreshPendingOps]);

  const triggerSync = useCallback(
    (options?: { immediate?: boolean }) => {
      intentSchedulerRef.current?.requestSync({
        immediate: Boolean(options?.immediate),
      });
      void refreshPendingOps();
    },
    [refreshPendingOps],
  );

  // Use ref for state.phase to keep queueIdleSync stable across phase changes
  // This prevents cascading reference changes that would re-trigger the load effect in useNoteContent
  useEffect(() => {
    statePhaseRef.current = state.phase;
  }, [state.phase]);

  const queueIdleSync = useCallback(
    (options?: { delayMs?: number }) => {
      if (statePhaseRef.current === "disabled" || statePhaseRef.current === "offline") return;
      intentSchedulerRef.current?.requestIdleSync(options);
      void refreshPendingOps();
    },
    [refreshPendingOps],
  );

  useEffect(() => {
    if (!repository || !syncEnabled) return;
    if (!state.intent) return;
    syncServiceRef.current?.syncNow();
    dispatch({ type: "SYNC_DISPATCHED" });
  }, [repository, syncEnabled, state.intent]);

  useEffect(() => {
    if (state.status === SyncStatus.Synced) {
      window.setTimeout(() => {
        setLastSynced(new Date());
      }, 0);
      window.setTimeout(() => {
        void refreshPendingOps();
      }, 0);
    }
    if (state.status === SyncStatus.Error) {
      window.setTimeout(() => {
        void refreshPendingOps();
      }, 0);
    }
  }, [state.status, refreshPendingOps]);

  return {
    syncStatus: state.status,
    syncError,
    lastSynced,
    triggerSync,
    queueIdleSync,
    pendingOps,
  };
}
