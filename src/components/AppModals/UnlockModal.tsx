import { useCallback, useState } from "react";
import { Modal } from "../Modal";
import { VaultPanel } from "../VaultPanel";
import { Button } from "../Button";
import styles from "../VaultPanel/VaultPanel.module.css";

interface UnlockModalProps {
  isOpen: boolean;
  error: string | null;
  isBusy: boolean;
  onSubmit: (password: string) => void;
  onSignOut: () => void;
}

export function UnlockModal({
  isOpen,
  error,
  isBusy,
  onSubmit,
  onSignOut,
}: UnlockModalProps) {
  const [password, setPassword] = useState("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit(password);
    },
    [password, onSubmit],
  );

  return (
    <Modal isOpen={isOpen} onClose={() => {}}>
      <VaultPanel
        title="Unlock your notes"
        helper="Enter your password to decrypt your notes."
      >
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="unlock-password">
            Password
          </label>
          <input
            id="unlock-password"
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isBusy}
            required
            minLength={6}
            autoFocus
          />

          {error && <div className={styles.error}>{error}</div>}

          <Button
            className={styles.actionButton}
            variant="primary"
            type="submit"
            disabled={isBusy}
          >
            {isBusy ? "Unlocking..." : "Unlock"}
          </Button>
        </form>

        <p className={styles.note}>
          Wrong account?{" "}
          <button
            type="button"
            className={styles.toggle}
            onClick={onSignOut}
            disabled={isBusy}
          >
            Sign out
          </button>
        </p>
      </VaultPanel>
    </Modal>
  );
}
