import { SyncStatus } from '../../types';
import type { PendingOpsSummary } from '../../domain/sync';

interface SyncIndicatorProps {
  status: SyncStatus;
  pendingOps?: PendingOpsSummary;
}

export function SyncIndicator({ status, pendingOps }: SyncIndicatorProps) {
  const hasPendingOps = (pendingOps?.total ?? 0) > 0;

  const getLabel = () => {
    if (hasPendingOps && status === SyncStatus.Idle) {
      return 'Sync needed';
    }
    switch (status) {
      case SyncStatus.Syncing:
        return 'Syncing...';
      case SyncStatus.Synced:
        return 'Synced';
      case SyncStatus.Offline:
        return 'Offline';
      case SyncStatus.Error:
        return 'Sync error';
      default:
        return '';
    }
  };

  const label = getLabel();
  if (!label) return null;

  const classSuffix = hasPendingOps && status === SyncStatus.Idle ? 'pending' : status;

  return (
    <span className={`sync-indicator sync-indicator--${classSuffix}`}>
      {status === SyncStatus.Syncing && <span className="sync-indicator__spinner" />}
      {label}
    </span>
  );
}
