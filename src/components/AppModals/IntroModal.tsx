import { Modal } from "../Modal";
import { Button } from "../Button";
import { IntroPreview } from "./IntroPreview";
import styles from "./IntroModal.module.css";

interface IntroModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  onStartWriting: () => void;
  onSetupSync: () => void;
}

export function IntroModal({
  isOpen,
  onDismiss,
  onStartWriting,
  onSetupSync,
}: IntroModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onDismiss}>
      <div className={styles.container}>
        <div className={styles.card}>
          <h2 className={styles.title}>Welcome to DailyNote</h2>
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
              onClick={onStartWriting}
            >
              Start writing
            </Button>
            <Button
              className={styles.actionButton}
              variant="ghost"
              onClick={() => {
                onDismiss();
                onSetupSync();
              }}
            >
              Set up sync
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
