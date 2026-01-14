import { Button } from "../Button";
import styles from "./UpdatePrompt.module.css";

interface UpdatePromptProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

export function UpdatePrompt({ onUpdate, onDismiss }: UpdatePromptProps) {
  return (
    <div className={styles.toast} role="alert" aria-live="polite">
      <span className={styles.message}>A new version is available</span>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onDismiss}>
          Later
        </Button>
        <Button variant="primary" onClick={onUpdate}>
          Update
        </Button>
      </div>
    </div>
  );
}
