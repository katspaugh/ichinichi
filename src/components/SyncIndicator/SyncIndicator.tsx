import { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../domain/sync";
import styles from "./SyncIndicator.module.css";

interface SyncIndicatorProps {
  status: SyncStatus;
  pendingOps?: PendingOpsSummary;
  errorMessage?: string;
}

export function SyncIndicator({
  status,
  pendingOps,
  errorMessage,
}: SyncIndicatorProps) {
  const hasPendingOps = (pendingOps?.total ?? 0) > 0;

  const getLabel = () => {
    if (hasPendingOps && status === SyncStatus.Idle) {
      return "Sync needed";
    }
    switch (status) {
      case SyncStatus.Syncing:
        return "Syncing...";
      case SyncStatus.Synced:
        return "Synced";
      case SyncStatus.Offline:
        return "Offline";
      case SyncStatus.Error:
        return "Sync error";
      default:
        return "";
    }
  };

  const label = getLabel();
  if (!label) return null;

  const classSuffix =
    hasPendingOps && status === SyncStatus.Idle ? "pending" : status;
  const statusClassMap: Record<string, string | undefined> = {
    [SyncStatus.Synced]: styles.synced,
    [SyncStatus.Error]: styles.error,
    [SyncStatus.Offline]: styles.offline,
    pending: styles.pending,
  };
  const statusClass = statusClassMap[classSuffix];

  return (
    <span
      className={[styles.indicator, statusClass].filter(Boolean).join(" ")}
      title={status === SyncStatus.Error ? errorMessage : undefined}
    >
      {status === SyncStatus.Syncing && <span className={styles.spinner} />}
      {label}
    </span>
  );
}
