import { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../domain/sync";
import styles from "./SyncIndicator.module.css";

interface SyncIndicatorProps {
  status?: SyncStatus;
  pendingOps?: PendingOpsSummary;
  errorMessage?: string;
  onSignIn?: () => void;
  onSyncClick?: () => void;
}

export function SyncIndicator({
  status,
  pendingOps,
  errorMessage,
  onSignIn,
  onSyncClick,
}: SyncIndicatorProps) {
  const hasPendingOps = (pendingOps?.total ?? 0) > 0;

  // Show sign in button when no status (not signed in)
  if (!status && onSignIn) {
    return (
      <button className={styles.indicator} onClick={onSignIn}>
        Sign in
      </button>
    );
  }

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

  // Always render to maintain consistent layout
  if (!label) {
    return <span className={styles.indicator} style={{ visibility: "hidden" }}>Synced</span>;
  }

  const classSuffix =
    hasPendingOps && status === SyncStatus.Idle ? "pending" : status ?? "";
  const statusClassMap: Record<string, string | undefined> = {
    [SyncStatus.Synced]: styles.synced,
    [SyncStatus.Error]: styles.error,
    [SyncStatus.Offline]: styles.offline,
    pending: styles.pending,
  };
  const statusClass = statusClassMap[classSuffix];

  const isClickable = onSyncClick && status !== SyncStatus.Syncing;

  if (isClickable) {
    return (
      <button
        className={[styles.indicator, statusClass].filter(Boolean).join(" ")}
        onClick={onSyncClick}
        title={status === SyncStatus.Error ? errorMessage : undefined}
      >
        {label}
      </button>
    );
  }

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
