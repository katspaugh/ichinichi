import type { UnifiedSyncedNoteRepository } from "../notes/hydratingSyncedNoteRepository";
import type { SyncError } from "../errors";
import type { SyncStatus } from "../../types";
import type { PendingOpsSource } from "./pendingOpsSource";

export interface SyncService {
  syncNow: () => Promise<void>;
  dispose: () => void;
}

export function createSyncService(
  repository: UnifiedSyncedNoteRepository,
  pendingOpsSource: PendingOpsSource,
  options?: {
    onSyncStart?: () => void;
    onSyncComplete?: (status: SyncStatus) => void;
    onSyncError?: (error: SyncError) => void;
  },
): SyncService {
  void pendingOpsSource;
  let syncQueued = false;
  let currentSyncPromise: Promise<void> | null = null;

  const runSyncLoop = async (): Promise<void> => {
    if (currentSyncPromise) {
      syncQueued = true;
      return currentSyncPromise;
    }

    currentSyncPromise = (async () => {
      try {
        while (true) {
          syncQueued = false;
          options?.onSyncStart?.();
          try {
            const result = await repository.sync();
            if (result.ok) {
              options?.onSyncComplete?.(result.value);
            } else {
              options?.onSyncError?.(result.error);
              break;
            }
          } catch (error) {
            options?.onSyncError?.({
              type: "Unknown",
              message:
                error instanceof Error ? error.message : "Sync failed.",
            });
            break;
          }
          if (!syncQueued) {
            break;
          }
        }
      } finally {
        currentSyncPromise = null;
      }
    })();

    return currentSyncPromise;
  };

  const dispose = () => {
    syncQueued = false;
  };

  return {
    syncNow: runSyncLoop,
    dispose,
  };
}

export async function getPendingOpsSummary(
  pendingOpsSource: PendingOpsSource,
) {
  return pendingOpsSource.getSummary();
}

export async function hasPendingOps(pendingOpsSource: PendingOpsSource) {
  return pendingOpsSource.hasPending();
}
