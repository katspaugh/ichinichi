import { useState, useEffect } from "react";
import type { ReplicationHandle } from "../storage/rxdb/replication";
import { SyncStatus } from "../types";

interface UseSyncStatusResult {
  status: SyncStatus;
  error: string | null;
}

export function useSyncStatus(replication: ReplicationHandle | null): UseSyncStatusResult {
  const [status, setStatus] = useState<SyncStatus>(SyncStatus.Idle);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!replication) return;

    const activeSub = replication.notes.active$.subscribe((active) => {
      if (active) {
        setStatus(SyncStatus.Syncing);
      } else {
        setStatus((prev) =>
          prev === SyncStatus.Syncing ? SyncStatus.Synced : prev,
        );
      }
    });

    const errorSub = replication.notes.error$.subscribe((err) => {
      if (err) {
        setStatus(SyncStatus.Error);
        setError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      activeSub.unsubscribe();
      errorSub.unsubscribe();
    };
  }, [replication]);

  return { status, error };
}
