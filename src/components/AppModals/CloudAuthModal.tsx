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
}: CloudAuthModalProps) {
  if (isVaultLocked) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={onDismiss}>
      {isSigningIn ? (
        <VaultPanel>
          <div className={styles.loading}>Signing in...</div>
        </VaultPanel>
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
