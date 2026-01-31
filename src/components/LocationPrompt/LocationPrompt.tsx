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

export function LocationPrompt({ isOpen, onComplete }: LocationPromptProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const country = locationService.detectCountry();

  const handleAllow = useCallback(async () => {
    setIsRequesting(true);
    locationService.setPromptShown();

    // Request location - this triggers the browser permission prompt
    const position = await locationService.getCurrentPosition();
    setIsRequesting(false);
    onComplete(position !== null);
  }, [onComplete]);

  const handleDeny = useCallback(() => {
    locationService.setPromptShown();
    onComplete(false);
  }, [onComplete]);

  const helperText = country
    ? `Sources tell me you're in ${country}. Share your precise location for weather in your notes.`
    : "Share your location to add weather to your notes.";

  return (
    <Modal isOpen={isOpen} onClose={handleDeny}>
      <VaultPanel title="Add weather to notes?" helper={helperText}>
        <div className={styles.choices}>
          <Button
            className={styles.actionButton}
            variant="primary"
            onClick={handleAllow}
            disabled={isRequesting}
          >
            {isRequesting ? "Requesting..." : "Allow location"}
          </Button>
          <Button
            className={styles.actionButton}
            variant="ghost"
            onClick={handleDeny}
            disabled={isRequesting}
          >
            No thanks
          </Button>
        </div>
      </VaultPanel>
    </Modal>
  );
}
