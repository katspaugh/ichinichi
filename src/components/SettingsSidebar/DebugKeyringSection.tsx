import { useState, useCallback } from "react";
import { Key, Check, Trash2, RefreshCw } from "lucide-react";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { VaultPanel } from "../VaultPanel";
import type { CloudKeyInfo } from "../../hooks/useDebugKeyring";
import styles from "./SettingsSidebar.module.css";
import formStyles from "../VaultPanel/VaultPanel.module.css";
import debugStyles from "./DebugKeyringSection.module.css";

type ActionStatus = "idle" | "busy" | "success" | "error";

interface DebugKeyringSectionProps {
  cloudKeys: CloudKeyInfo[];
  activeKeyId: string | null;
  isSignedIn: boolean;
  userEmail: string;
  rewrapStatus: ActionStatus;
  rewrapError: string | null;
  onRewrap: (password: string) => Promise<void>;
  onResetRewrapStatus: () => void;
  cleanupStatus: ActionStatus;
  cleanupResult: string | null;
  onCleanup: () => Promise<void>;
  onResetCleanupStatus: () => void;
  reencryptStatus: ActionStatus;
  reencryptResult: string | null;
  onReencrypt: (password: string) => Promise<void>;
  onResetReencryptStatus: () => void;
}

function DebugPasswordModal({
  isOpen,
  onClose,
  title,
  helper,
  userEmail,
  idPrefix,
  passwordAutoComplete,
  isBusy,
  error,
  onSubmit,
  submitLabel,
  busyLabel,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  helper: string;
  userEmail: string;
  idPrefix: string;
  passwordAutoComplete: string;
  isBusy: boolean;
  error: string | null;
  onSubmit: (password: string) => void;
  submitLabel: string;
  busyLabel: string;
}) {
  const [password, setPassword] = useState("");

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <VaultPanel title={title} helper={helper}>
        <form
          className={formStyles.form}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(password);
            setPassword("");
          }}
        >
          <label className={formStyles.label} htmlFor={`${idPrefix}-email`}>
            Email
          </label>
          <input
            id={`${idPrefix}-email`}
            className={formStyles.input}
            type="email"
            autoComplete="email"
            value={userEmail}
            readOnly
            tabIndex={-1}
          />
          <label className={formStyles.label} htmlFor={`${idPrefix}-password`}>
            Password
          </label>
          <input
            id={`${idPrefix}-password`}
            className={formStyles.input}
            type="password"
            autoComplete={passwordAutoComplete}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isBusy}
            required
            minLength={6}
          />
          {error && <div className={formStyles.error}>{error}</div>}
          <Button
            className={formStyles.actionButton}
            variant="primary"
            type="submit"
            disabled={!password || isBusy}
          >
            {isBusy ? busyLabel : submitLabel}
          </Button>
        </form>
      </VaultPanel>
    </Modal>
  );
}

export function DebugKeyringSection({
  cloudKeys,
  activeKeyId,
  isSignedIn,
  userEmail,
  rewrapStatus,
  rewrapError,
  onRewrap,
  onResetRewrapStatus,
  cleanupStatus,
  cleanupResult,
  onCleanup,
  onResetCleanupStatus,
  reencryptStatus,
  reencryptResult,
  onReencrypt,
  onResetReencryptStatus,
}: DebugKeyringSectionProps) {
  const [rewrapOpen, setRewrapOpen] = useState(false);
  const [reencryptOpen, setReencryptOpen] = useState(false);

  const handleRewrap = useCallback(
    (password: string) => {
      void onRewrap(password).then(() => setRewrapOpen(false));
    },
    [onRewrap],
  );

  const handleReencrypt = useCallback(
    (password: string) => {
      void onReencrypt(password).then(() => setReencryptOpen(false));
    },
    [onReencrypt],
  );

  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>Debug: key ring</p>

      <div className={debugStyles.keyList}>
        {cloudKeys.map((info) => (
          <div key={info.keyId} className={debugStyles.keyRow}>
            <div className={debugStyles.keyId}>
              <Key className={debugStyles.keyIcon} />
              <code className={debugStyles.keyHash}>
                {info.keyId.slice(0, 8)}
              </code>
              {info.keyId === activeKeyId && (
                <span className={debugStyles.badge} data-variant="primary">
                  primary
                </span>
              )}
            </div>
            <div className={debugStyles.keyMeta}>
              <span
                className={debugStyles.badge}
                data-variant={info.isPrimary ? "success" : "muted"}
              >
                {info.isPrimary ? "cloud primary" : "cloud"}
              </span>
            </div>
          </div>
        ))}
        {cloudKeys.length === 0 && (
          <p className={debugStyles.empty}>No keys in cloud keyring</p>
        )}
      </div>

      {isSignedIn && cloudKeys.length > 0 && (
        <>
          <button
            className={styles.actionButton}
            type="button"
            onClick={() => {
              setRewrapOpen(true);
              onResetRewrapStatus();
            }}
          >
            <Key className={styles.actionIcon} />
            Rewrap DEK
          </button>

          {rewrapStatus === "success" && (
            <span className={debugStyles.statusMsg} data-variant="success">
              <Check className={debugStyles.statusIcon} />
              DEK rewrapped
            </span>
          )}

          <button
            className={styles.actionButton}
            type="button"
            disabled={cleanupStatus === "busy"}
            onClick={() => {
              onResetCleanupStatus();
              void onCleanup();
            }}
          >
            <Trash2 className={styles.actionIcon} />
            {cleanupStatus === "busy" ? "Cleaning up..." : "Clean up keys"}
          </button>

          {cleanupStatus === "success" && cleanupResult && (
            <span className={debugStyles.statusMsg} data-variant="success">
              <Check className={debugStyles.statusIcon} />
              {cleanupResult}
            </span>
          )}
          {cleanupStatus === "error" && cleanupResult && (
            <span className={debugStyles.statusMsg} data-variant="error">
              {cleanupResult}
            </span>
          )}

          <button
            className={styles.actionButton}
            type="button"
            onClick={() => {
              setReencryptOpen(true);
              onResetReencryptStatus();
            }}
          >
            <RefreshCw className={styles.actionIcon} />
            Re-encrypt all notes
          </button>

          {reencryptStatus === "success" && reencryptResult && (
            <span className={debugStyles.statusMsg} data-variant="success">
              <Check className={debugStyles.statusIcon} />
              {reencryptResult}
            </span>
          )}
          {reencryptStatus === "error" && reencryptResult && (
            <span className={debugStyles.statusMsg} data-variant="error">
              {reencryptResult}
            </span>
          )}

          <DebugPasswordModal
            isOpen={rewrapOpen}
            onClose={() => setRewrapOpen(false)}
            title="Rewrap DEK"
            helper="Enter a new password to re-encrypt the DEK and upload to Supabase."
            userEmail={userEmail}
            idPrefix="debug-rewrap"
            passwordAutoComplete="new-password"
            isBusy={rewrapStatus === "busy"}
            error={rewrapStatus === "error" ? rewrapError : null}
            onSubmit={handleRewrap}
            submitLabel="Rewrap"
            busyLabel="Rewrapping..."
          />

          <DebugPasswordModal
            isOpen={reencryptOpen}
            onClose={() => setReencryptOpen(false)}
            title="Re-encrypt all notes"
            helper="Re-encrypts all Supabase notes with the primary DEK, deletes all other keys. Requires your Supabase password."
            userEmail={userEmail}
            idPrefix="debug-reencrypt"
            passwordAutoComplete="current-password"
            isBusy={reencryptStatus === "busy"}
            error={reencryptStatus === "error" ? reencryptResult : null}
            onSubmit={handleReencrypt}
            submitLabel="Re-encrypt"
            busyLabel="Re-encrypting..."
          />
        </>
      )}
    </div>
  );
}
