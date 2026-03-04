import type { ModelStatus } from "@/stores/localAiStore";
import styles from "./SettingsSidebar.module.css";

interface LocalAiSectionProps {
  enabled: boolean;
  modelStatus: ModelStatus;
  modelError: string | null;
  onToggle: () => void;
}

export function LocalAiSection({
  enabled,
  modelStatus,
  modelError,
  onToggle,
}: LocalAiSectionProps) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>Local AI</p>

      <div className={styles.toggleRow}>
        <span className={styles.rowLabel}>Enable Local AI</span>
        <button
          className={styles.switch}
          type="button"
          role="switch"
          aria-checked={enabled}
          data-checked={enabled}
          onClick={onToggle}
        >
          <span className={styles.switchThumb} />
        </button>
      </div>

      <p className={styles.aiDescription}>
        Automatically extracts semantic tags from your notes using an in-browser
        AI model. Your data never leaves your device.
      </p>

      {enabled && modelStatus === "downloading" && (
        <p className={styles.aiStatus}>Downloading model…</p>
      )}

      {enabled && modelStatus === "ready" && (
        <p className={styles.aiStatus}>Model ready</p>
      )}

      {enabled && modelStatus === "error" && (
        <p className={styles.aiStatusError}>
          {modelError || "Failed to load model."}
        </p>
      )}
    </div>
  );
}
