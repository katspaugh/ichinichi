import { Modal } from "../Modal";
import { Button } from "../Button";
import styles from "./PrivacyPolicyModal.module.css";

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivacyPolicyModal({
  isOpen,
  onClose,
}: PrivacyPolicyModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className={styles.container}>
        <div className={styles.card}>
          <h2 className={styles.title}>Privacy Policy</h2>
          <p className={styles.subtitle}>
            Ichinichi stores your notes locally and encrypts them before
            storage.
          </p>
          <ul className={styles.list}>
            <li>No tracking, ads, or analytics.</li>
            <li>Your data stays on device unless you enable sync.</li>
            <li>Cloud sync stores encrypted backups only.</li>
          </ul>
          <Button className={styles.closeButton} variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
