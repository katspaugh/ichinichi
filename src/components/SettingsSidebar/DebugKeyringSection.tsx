import { useState, useCallback } from "react";
import { Key, Check } from "lucide-react";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { VaultPanel } from "../VaultPanel";
import type { DebugKeyInfo } from "../../hooks/useDebugKeyring";
import styles from "./SettingsSidebar.module.css";
import formStyles from "../VaultPanel/VaultPanel.module.css";
import debugStyles from "./DebugKeyringSection.module.css";

interface DebugKeyringSectionProps {
  keys: DebugKeyInfo[];
  isSignedIn: boolean;
  rewrapStatus: "idle" | "rewrapping" | "success" | "error";
  rewrapError: string | null;
  onRewrap: (password: string) => Promise<void>;
  onResetRewrapStatus: () => void;
}

function typeLabel(info: DebugKeyInfo): string {
  if (info.inLocal && info.inCloud) return "both";
  if (info.inLocal) return "local";
  if (info.inCloud) return "cloud";
  return "memory";
}

export function DebugKeyringSection({
  keys,
  isSignedIn,
  rewrapStatus,
  rewrapError,
  onRewrap,
  onResetRewrapStatus,
}: DebugKeyringSectionProps) {
  const [rewrapOpen, setRewrapOpen] = useState(false);
  const [password, setPassword] = useState("");

  const handleRewrap = useCallback(async () => {
    await onRewrap(password);
    setPassword("");
    setRewrapOpen(false);
  }, [password, onRewrap]);

  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>Debug: Key Ring</p>

      <div className={debugStyles.keyList}>
        {keys.map((info) => (
          <div key={info.keyId} className={debugStyles.keyRow}>
            <div className={debugStyles.keyId}>
              <Key className={debugStyles.keyIcon} />
              <code className={debugStyles.keyHash}>
                {info.keyId.slice(0, 8)}
              </code>
              {info.isPrimary && (
                <span className={debugStyles.badge} data-variant="primary">
                  primary
                </span>
              )}
            </div>
            <div className={debugStyles.keyMeta}>
              <span className={debugStyles.badge} data-variant="neutral">
                {typeLabel(info)}
              </span>
              <span
                className={debugStyles.badge}
                data-variant={info.inCloud ? "success" : "muted"}
              >
                {info.inCloud ? "supabase" : "no cloud"}
              </span>
            </div>
          </div>
        ))}
        {keys.length === 0 && (
          <p className={debugStyles.empty}>No keys in keyring</p>
        )}
      </div>

      {isSignedIn && keys.length > 0 && (
        <>
          <button
            className={styles.actionButton}
            type="button"
            onClick={() => {
              setRewrapOpen(true);
              setPassword("");
              onResetRewrapStatus();
            }}
          >
            <Key className={styles.actionIcon} />
            Rewrap All Keys
          </button>

          {rewrapStatus === "success" && (
            <span className={debugStyles.statusMsg} data-variant="success">
              <Check className={debugStyles.statusIcon} />
              All keys rewrapped
            </span>
          )}

          <Modal isOpen={rewrapOpen} onClose={() => setRewrapOpen(false)}>
            <VaultPanel
              title="Rewrap all keys"
              helper="Enter a new password to re-encrypt all DEKs and upload to Supabase."
            >
              <form
                className={formStyles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleRewrap();
                }}
              >
                <label
                  className={formStyles.label}
                  htmlFor="debug-rewrap-password"
                >
                  New password
                </label>
                <input
                  id="debug-rewrap-password"
                  className={formStyles.input}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (rewrapStatus === "error") onResetRewrapStatus();
                  }}
                  disabled={rewrapStatus === "rewrapping"}
                  required
                  minLength={6}
                />
                {rewrapStatus === "error" && (
                  <div className={formStyles.error}>{rewrapError}</div>
                )}
                <Button
                  className={formStyles.actionButton}
                  variant="primary"
                  type="submit"
                  disabled={!password || rewrapStatus === "rewrapping"}
                >
                  {rewrapStatus === "rewrapping" ? "Rewrapping..." : "Rewrap"}
                </Button>
              </form>
            </VaultPanel>
          </Modal>
        </>
      )}
    </div>
  );
}
