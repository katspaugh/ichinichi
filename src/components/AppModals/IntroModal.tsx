import { Modal } from "../Modal";
import { ModalCard } from "../ModalCard";
import { Button } from "../Button";
import { IntroPreview } from "./IntroPreview";
import styles from "./IntroModal.module.css";

interface IntroModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  onSetupSync: () => void;
}

export function IntroModal({
  isOpen,
  onDismiss,
  onSetupSync,
}: IntroModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onDismiss}>
      <ModalCard maxWidth="md" fullScreenMobile>
        <h2 className={styles.title}>Welcome to Ichinichi</h2>
        <p className={styles.helper}>
          A calm place for one note per day. No account required to start.
        </p>
        <IntroPreview />
        <ul className={styles.introList}>
          <li>Your notes are encrypted on this device before storage.</li>
          <li>Sync is optional and keeps encrypted backups in the cloud.</li>
        </ul>
        <div className={styles.choices}>
          <Button
            className={styles.actionButton}
            variant="primary"
            onClick={() => {
              onDismiss();
              onSetupSync();
            }}
          >
            Sign in / sign up
          </Button>
          <Button
            className={styles.actionButton}
            variant="ghost"
            onClick={onDismiss}
          >
            Maybe later
          </Button>
        </div>
      </ModalCard>
    </Modal>
  );
}
