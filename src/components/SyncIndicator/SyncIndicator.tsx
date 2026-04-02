import { SyncStatus } from "../../types";
import styles from "./SyncIndicator.module.css";

interface SyncIndicatorProps {
  status?: SyncStatus;
  isSaving?: boolean;
  onSyncClick?: () => void;
}

export function SyncIndicator({
  status,
  isSaving,
  onSyncClick,
}: SyncIndicatorProps) {

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
    : status ?? "";
  const statusClassMap: Record<string, string | undefined> = {
    [SyncStatus.Synced]: styles.synced,
    [SyncStatus.Error]: styles.error,
    [SyncStatus.Offline]: styles.offline,
    saving: styles.saving,
  };
  const statusClass = statusClassMap[classSuffix];

  const isClickable = onSyncClick && status !== SyncStatus.Syncing;

  if (isClickable) {
    return (
      <button
        className={[styles.indicator, statusClass].filter(Boolean).join(" ")}
        onClick={onSyncClick}
      >
        {label}
      </button>
    );
  }

  return (
    <span
      className={[styles.indicator, statusClass].filter(Boolean).join(" ")}
    >
      {(status === SyncStatus.Syncing || isSaving) && (
        <span className={styles.spinner} />
      )}
      {label}
    </span>
  );
}
