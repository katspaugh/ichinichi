import { useState, useCallback } from "react";
import { Modal } from "../Modal";
import { VaultPanel } from "../VaultPanel";
import { Button } from "../Button";
import styles from "../VaultPanel/VaultPanel.module.css";

interface ResetPasswordModalProps {
  isOpen: boolean;
  error: string | null;
  onSubmit: (password: string) => Promise<{ success: boolean }>;
  onDismiss: () => void;
}

export function ResetPasswordModal({
  isOpen,
  error,
  onSubmit,
  onDismiss,
}: ResetPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (password !== confirm) {
        setMismatch(true);
        return;
      }
      setMismatch(false);
      setIsBusy(true);
      const result = await onSubmit(password);
      setIsBusy(false);
      if (result.success) {
        setSuccess(true);
      }
    },
    [password, confirm, onSubmit],
  );

  if (success) {
    return (
      <Modal isOpen={isOpen} onClose={onDismiss}>
        <VaultPanel title="Password updated">
          <p className={styles.helper}>
            Your password has been changed successfully.
          </p>
          <Button
            className={styles.actionButton}
            variant="primary"
            onClick={onDismiss}
          >
            Done
          </Button>
        </VaultPanel>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onDismiss}>
      <VaultPanel title="Set new password">
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isBusy}
            required
            minLength={6}
          />

          <label className={styles.label} htmlFor="confirm-password">
            Confirm password
          </label>
          <input
            id="confirm-password"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={isBusy}
            required
            minLength={6}
          />

          {mismatch && (
            <div className={styles.error}>Passwords do not match.</div>
          )}
          {error && <div className={styles.error}>{error}</div>}

          <Button
            className={styles.actionButton}
            variant="primary"
            type="submit"
            disabled={isBusy}
          >
            {isBusy ? "Updating..." : "Update password"}
          </Button>
        </form>
      </VaultPanel>
    </Modal>
  );
}
