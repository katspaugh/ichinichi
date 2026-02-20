import { Github } from "lucide-react";
import { Modal } from "../Modal";
import { ModalCard } from "../ModalCard";
import { Button } from "../Button";
import { IntroPreview } from "./IntroPreview";
import styles from "./AboutModal.module.css";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalCard maxWidth="md" className={styles.content}>
        <h2 className={styles.title}>About Ichinichi</h2>
        <p className={styles.subtitle}>
          A calm place for one note per day. No account required to start.
        </p>
        <IntroPreview />
        <ul className={styles.list}>
          <li>Your notes are encrypted on this device before storage.</li>
          <li>Sync is optional and keeps encrypted backups in the cloud.</li>
        </ul>
        <a
          className={styles.builder}
          href="https://github.com/katspaugh/ichinichi"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Github className={styles.builderIcon} />
          <span>Built by katspaugh</span>
        </a>
        <Button className={styles.closeButton} variant="primary" onClick={onClose}>
          Close
        </Button>
      </ModalCard>
    </Modal>
  );
}
