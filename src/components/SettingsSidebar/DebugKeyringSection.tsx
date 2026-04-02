import { useState, useEffect, useCallback } from "react";
import { Key, Check, AlertCircle } from "lucide-react";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { VaultPanel } from "../VaultPanel";
import { fetchUserKeyring } from "../../storage/userKeyring";
import { listLocalKeyIds } from "../../storage/localKeyring";
import { rewrapCloudKeyring } from "../../services/vaultService";
import { supabase } from "../../lib/supabase";
import styles from "./SettingsSidebar.module.css";
import formStyles from "../VaultPanel/VaultPanel.module.css";
import debugStyles from "./DebugKeyringSection.module.css";

interface DebugKeyringSectionProps {
  keyring: Map<string, CryptoKey>;
  activeKeyId: string | null;
  userId: string | null;
  isSignedIn: boolean;
}

interface KeyInfo {
  keyId: string;
  inLocal: boolean;
  inCloud: boolean;
  isPrimary: boolean;
}

export function DebugKeyringSection({
  keyring,
  activeKeyId,
  userId,
  isSignedIn,
}: DebugKeyringSectionProps) {
  const [cloudKeyIds, setCloudKeyIds] = useState<Set<string>>(new Set());
  const [localKeyIds, setLocalKeyIds] = useState<Set<string>>(new Set());
  const [rewrapOpen, setRewrapOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [rewrapStatus, setRewrapStatus] = useState<
    "idle" | "rewrapping" | "success" | "error"
  >("idle");
  const [rewrapError, setRewrapError] = useState<string | null>(null);

  useEffect(() => {
    setLocalKeyIds(new Set(listLocalKeyIds()));
  }, [keyring]);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let cancelled = false;
    void fetchUserKeyring(supabase, userId).then((entries) => {
      if (!cancelled) {
        setCloudKeyIds(new Set(entries.map((e) => e.keyId)));
      }
    });
    return () => { cancelled = true; };
  }, [isSignedIn, userId, keyring, rewrapStatus]);

  const keys: KeyInfo[] = [];
  for (const [keyId] of keyring.entries()) {
    if (keyId === "legacy") continue;
    keys.push({
      keyId,
      inLocal: localKeyIds.has(keyId),
      inCloud: cloudKeyIds.has(keyId),
      isPrimary: keyId === activeKeyId,
    });
  }

  const handleRewrap = useCallback(async () => {
    if (!password || !userId) return;
    setRewrapStatus("rewrapping");
    setRewrapError(null);
    try {
      const keysToSync = new Map<string, CryptoKey>();
      for (const [keyId, key] of keyring.entries()) {
        if (keyId !== "legacy") keysToSync.set(keyId, key);
      }
      await rewrapCloudKeyring({
        supabase,
        userId,
        newPassword: password,
        keyring: keysToSync,
        primaryKeyId: activeKeyId,
      });
      setRewrapStatus("success");
      setPassword("");
      setRewrapOpen(false);
    } catch (err) {
      setRewrapStatus("error");
      setRewrapError(err instanceof Error ? err.message : "Rewrap failed");
    }
  }, [password, userId, keyring, activeKeyId]);

  const typeLabel = (info: KeyInfo) => {
    if (info.inLocal && info.inCloud) return "both";
    if (info.inLocal) return "local";
    if (info.inCloud) return "cloud";
    return "memory";
  };

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

      {isSignedIn && userId && keys.length > 0 && (
        <>
          <button
            className={styles.actionButton}
            type="button"
            onClick={() => {
              setRewrapOpen(true);
              setPassword("");
              setRewrapStatus("idle");
              setRewrapError(null);
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
                    if (rewrapStatus === "error") setRewrapStatus("idle");
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
