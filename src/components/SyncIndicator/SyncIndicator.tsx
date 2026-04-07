import { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../types";
import styles from "./SyncIndicator.module.css";

interface SyncIndicatorProps {
  status?: SyncStatus;
  pendingOps?: PendingOpsSummary;
  errorMessage?: string;
  isSaving?: boolean;
  onSignIn?: () => void;
  onSyncClick?: () => void;
}

export function SyncIndicator({
  status,
  pendingOps,
  errorMessage,
  isSaving,
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
    switch (status) {
      case SyncStatus.Error:
        return "Sync error";
      case SyncStatus.Offline:
        return "Offline";
      case SyncStatus.Syncing:
        return "Syncing...";
      default:
        break;
    }
    if (isSaving) return "Saving...";
    if (hasPendingOps && status === SyncStatus.Idle) return "Saved";
    if (status === SyncStatus.Synced) return "Synced";
    return "";
  };

  const label = getLabel();

  // Always render to maintain consistent layout
  if (!label) {
    return <span className={`${styles.indicator} ${styles.hidden}`}>Synced</span>;
  }

  const classSuffix = isSaving
    ? "saving"
    : hasPendingOps && status === SyncStatus.Idle
      ? "saved"
      : status ?? "";
  const statusClassMap: Record<string, string | undefined> = {
    [SyncStatus.Synced]: styles.synced,
    [SyncStatus.Error]: styles.error,
    [SyncStatus.Offline]: styles.offline,
    saving: styles.saving,
    saved: styles.synced,
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
      {(status === SyncStatus.Syncing || isSaving) && (
        <span className={styles.spinner} />
      )}
      {label}
    </span>
  );
}
