import { Modal } from "../Modal";
import { Button } from "../Button";
import { VaultPanel } from "../VaultPanel";
import styles from "../VaultPanel/VaultPanel.module.css";

interface AuthErrorModalProps {
  isOpen: boolean;
  error: string | null;
  onClose: () => void;
}

export function AuthErrorModal({ isOpen, error, onClose }: AuthErrorModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <VaultPanel title="Authentication error">
        {error && <p className={styles.error}>{error}</p>}
        <Button
          className={styles.actionButton}
          variant="primary"
          onClick={onClose}
        >
          OK
        </Button>
      </VaultPanel>
    </Modal>
  );
}
