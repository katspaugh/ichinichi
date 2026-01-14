import { useCallback, useEffect, useRef, useState } from "react";
import { SyncStatus } from "../types";
import type { UnifiedSyncedNoteRepository } from "../storage/unifiedSyncedNoteRepository";
import type { PendingOpsSummary, SyncService } from "../domain/sync";
import { createSyncService, getPendingOpsSummary } from "../domain/sync";
import { useSyncCoordinator } from "./useSyncCoordinator";

interface UseSyncReturn {
  syncStatus: SyncStatus;
  lastSynced: Date | null;
  triggerSync: (options?: { immediate?: boolean }) => void;
  queueIdleSync: (options?: { delayMs?: number }) => void;
  pendingOps: PendingOpsSummary;
}

export function useSync(
  repository: UnifiedSyncedNoteRepository | null,
  options?: { enabled?: boolean },
): UseSyncReturn {
  const [repoStatus, setRepoStatus] = useState<SyncStatus>(SyncStatus.Idle);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [pendingOps, setPendingOps] = useState<PendingOpsSummary>({
    notes: 0,
    images: 0,
    total: 0,
  });
  const syncServiceRef = useRef<SyncService | null>(null);
  const pendingPollRef = useRef<number | null>(null);
  const syncEnabled = options?.enabled ?? !!repository;
  const coordinator = useSyncCoordinator(syncEnabled);
  const coordinatorPhase = coordinator.phase;
  const coordinatorShouldSync = coordinator.shouldSync;
  const consumeSyncIntent = coordinator.consumeSyncIntent;
  const scheduleStateUpdate = useCallback((fn: () => void) => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(fn);
      return;
    }
    Promise.resolve().then(fn);
  }, []);

  // Subscribe to repository sync status changes
  const refreshPendingOps = useCallback(async () => {
    try {
      const summary = await getPendingOpsSummary();
      setPendingOps(summary);
    } catch {
      setPendingOps({ notes: 0, images: 0, total: 0 });
    }
  }, []);

  useEffect(() => {
    if (!repository || !syncEnabled) {
      scheduleStateUpdate(() => setRepoStatus(SyncStatus.Idle));
      return;
    }

    scheduleStateUpdate(() => setRepoStatus(repository.getSyncStatus()));
    return repository.onSyncStatusChange((status) => {
      setRepoStatus(status);
      if (status === SyncStatus.Synced) {
        setLastSynced(new Date());
        void refreshPendingOps();
      }
      if (status === SyncStatus.Error) {
        void refreshPendingOps();
      }
    });
  }, [repository, syncEnabled, refreshPendingOps, scheduleStateUpdate]);

  useEffect(() => {
    if (!repository || !syncEnabled) {
      if (syncServiceRef.current) {
        syncServiceRef.current.dispose();
        syncServiceRef.current = null;
      }
      if (pendingPollRef.current) {
        window.clearInterval(pendingPollRef.current);
        pendingPollRef.current = null;
      }
      scheduleStateUpdate(() =>
        setPendingOps({ notes: 0, images: 0, total: 0 }),
      );
      return;
    }

    if (syncServiceRef.current) {
      syncServiceRef.current.dispose();
    }
    syncServiceRef.current = createSyncService(repository);
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
      if (pendingPollRef.current) {
        window.clearInterval(pendingPollRef.current);
        pendingPollRef.current = null;
      }
    };
  }, [repository, syncEnabled, refreshPendingOps, scheduleStateUpdate]);

  // Sync function with debounce
  const triggerSync = useCallback(
    (options?: { immediate?: boolean }) => {
      syncServiceRef.current?.queueSync(options);
      void refreshPendingOps();
    },
    [refreshPendingOps],
  );

  const queueIdleSync = useCallback(
    (options?: { delayMs?: number }) => {
      syncServiceRef.current?.queueIdleSync(options);
      void refreshPendingOps();
    },
    [refreshPendingOps],
  );

  useEffect(() => {
    if (!repository || !syncEnabled) return;
    if (!coordinatorShouldSync) return;
    scheduleStateUpdate(() => triggerSync({ immediate: true }));
    consumeSyncIntent();
  }, [
    repository,
    syncEnabled,
    coordinatorShouldSync,
    consumeSyncIntent,
    triggerSync,
    scheduleStateUpdate,
  ]);

  useEffect(() => {
    return () => {
      if (syncServiceRef.current) {
        syncServiceRef.current.dispose();
      }
    };
  }, []);

  const syncStatus =
    !repository || !syncEnabled || coordinatorPhase === "disabled"
      ? SyncStatus.Idle
      : coordinatorPhase === "offline"
        ? SyncStatus.Offline
        : repoStatus;

  return {
    syncStatus,
    lastSynced,
    triggerSync,
    queueIdleSync,
    pendingOps,
  };
}
