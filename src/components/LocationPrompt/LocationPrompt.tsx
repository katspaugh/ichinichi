import { useState, useCallback } from "react";
import { Modal } from "../Modal";
import { VaultPanel } from "../VaultPanel";
import { Button } from "../Button";
import styles from "../VaultPanel/VaultPanel.module.css";

interface LocationPromptProps {
  isOpen: boolean;
  onConfirm: () => Promise<boolean>;
  onDeny: () => void;
}

// Inner component that handles the location prompt logic
// Separated so state resets when modal closes/opens
interface LocationPromptContentProps {
  onConfirm: () => Promise<boolean>;
  onDeny: () => void;
}

function LocationPromptContent({
  onConfirm,
  onDeny,
}: LocationPromptContentProps) {
  const [isRequesting, setIsRequesting] = useState(false);

  const handleConfirm = useCallback(async () => {
    setIsRequesting(true);
    try {
      await onConfirm();
    } finally {
      setIsRequesting(false);
    }
  }, [onConfirm]);

  const handleDeny = useCallback(() => {
    onDeny();
  }, [onDeny]);

  return (
    <VaultPanel
      title="Get precise location?"
      helper="Use GPS for more accurate weather data."
    >
      <div className={styles.choices}>
        <Button
          className={styles.actionButton}
          variant="primary"
          onClick={handleConfirm}
          disabled={isRequesting}
        >
          {isRequesting ? "Getting location..." : "Allow location"}
        </Button>
        <Button
          className={styles.actionButton}
          variant="ghost"
          onClick={handleDeny}
          disabled={isRequesting}
        >
          Keep using approximate location
        </Button>
      </div>
    </VaultPanel>
  );
}

export function LocationPrompt({
  isOpen,
  onConfirm,
  onDeny,
}: LocationPromptProps) {
  const handleDeny = useCallback(() => {
    onDeny();
  }, [onDeny]);

  return (
    <Modal isOpen={isOpen} onClose={handleDeny}>
      {isOpen && (
        <LocationPromptContent onConfirm={onConfirm} onDeny={onDeny} />
      )}
    </Modal>
  );
}
