import { useState } from "react";
import { Modal } from "../Modal";
import { AuthForm } from "../AuthForm";
import { VaultPanel } from "../VaultPanel";
import styles from "../VaultPanel/VaultPanel.module.css";

interface CloudAuthModalProps {
  isOpen: boolean;
  isSigningIn: boolean;
  isVaultLocked: boolean;
  isBusy: boolean;
  error: string | null;
  localPassword: string | null;
  onDismiss: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onVaultUnlock: (password: string) => void;
}

function VaultUnlockForm({
  isBusy,
  error,
  onUnlock,
  onSignOut,
}: {
  isBusy: boolean;
  error: string | null;
  onUnlock: (password: string) => void;
  onSignOut: () => void;
}) {
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      onUnlock(password);
    }
  };

  return (
    <VaultPanel>
      <h2 className={styles.title}>Unlock your notes</h2>
      <p className={styles.description}>Enter your password to decrypt your notes.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="vault-password" className={styles.label}>
          Password
        </label>
        <input
          id="vault-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={styles.input}
          autoFocus
          disabled={isBusy}
        />
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.button} disabled={isBusy || !password.trim()}>
          {isBusy ? "Unlocking..." : "Unlock"}
        </button>
      </form>
      <p className={styles.hint}>
        This browser remembers your unlock without storing the password.
      </p>
      <p className={styles.switchLink}>
        Wrong account?{" "}
        <button type="button" onClick={onSignOut} className={styles.link}>
          Sign out
        </button>
      </p>
    </VaultPanel>
  );
}

export function CloudAuthModal({
  isOpen,
  isSigningIn,
  isVaultLocked,
  isBusy,
  error,
  localPassword,
  onDismiss,
  onSignIn,
  onSignUp,
  onVaultUnlock,
}: CloudAuthModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onDismiss}>
      {isSigningIn ? (
        <VaultPanel>
          <div className={styles.loading}>Signing in...</div>
        </VaultPanel>
      ) : isVaultLocked ? (
        <VaultUnlockForm
          isBusy={isBusy}
          error={error}
          onUnlock={onVaultUnlock}
          onSignOut={onDismiss}
        />
      ) : (
        <AuthForm
          isBusy={isBusy}
          error={error}
          onSignIn={onSignIn}
          onSignUp={onSignUp}
          defaultPassword={localPassword}
        />
      )}
    </Modal>
  );
}
