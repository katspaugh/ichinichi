import { useState, useCallback } from "react";
import { Modal } from "../Modal";
import { VaultPanel } from "../VaultPanel";
import { Button } from "../Button";
import { locationService } from "../../services/locationService";
import styles from "../VaultPanel/VaultPanel.module.css";

interface LocationPromptProps {
  isOpen: boolean;
  onComplete: (granted: boolean) => void;
}

// Inner component that handles the location prompt logic
// Separated so state resets when modal closes/opens
function LocationPromptContent({
  onComplete,
}: {
  onComplete: (granted: boolean) => void;
}) {
  const [isRequesting, setIsRequesting] = useState(false);

  const handleConfirm = useCallback(async () => {
    setIsRequesting(true);

    // Request precise geolocation
    const position = await locationService.getCurrentPosition();
    setIsRequesting(false);
    onComplete(position !== null);
  }, [onComplete]);

  const handleDeny = useCallback(() => {
    onComplete(false);
  }, [onComplete]);

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
          Keep using IP location
        </Button>
      </div>
    </VaultPanel>
  );
}

export function LocationPrompt({ isOpen, onComplete }: LocationPromptProps) {
  const handleDeny = useCallback(() => {
    onComplete(false);
  }, [onComplete]);

  return (
    <Modal isOpen={isOpen} onClose={handleDeny}>
      {isOpen && <LocationPromptContent onComplete={onComplete} />}
    </Modal>
  );
}
