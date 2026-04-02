import { Modal } from "../Modal";
import { ModalCard } from "../ModalCard";
import { Button } from "../Button";
import { IntroPreview } from "./IntroPreview";
import styles from "../VaultPanel/VaultPanel.module.css";

interface IntroModalProps {
  isOpen: boolean;
  onGetStarted: () => void;
}

export function IntroModal({ isOpen, onGetStarted }: IntroModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onGetStarted}>
      <ModalCard maxWidth="md" fullScreenMobile>
        <h2 className={styles.title}>Welcome to Ichinichi</h2>
        <p className={styles.helper}>
          A calm place for one note per day.
        </p>
        <IntroPreview />
        <ul className={styles.introList}>
          <li>Your notes are end-to-end encrypted with your password.</li>
          <li>One note per day — write today, read any day.</li>
        </ul>
        <div className={styles.choices}>
          <Button
            className={styles.actionButton}
            variant="primary"
            onClick={onGetStarted}
          >
            Sign in / Sign up
          </Button>
        </div>
      </ModalCard>
    </Modal>
  );
}
