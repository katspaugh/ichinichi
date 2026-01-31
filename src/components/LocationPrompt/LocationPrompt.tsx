import { useState, useCallback, useEffect } from "react";
import { Modal } from "../Modal";
import { VaultPanel } from "../VaultPanel";
import { Button } from "../Button";
import {
  locationService,
  type IpLocation,
} from "../../services/locationService";
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
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [ipLocation, setIpLocation] = useState<IpLocation | null>(null);

  // Fetch IP location on mount
  useEffect(() => {
    let cancelled = false;
    locationService.getIpLocation().then((location) => {
      if (cancelled) return;
      setIpLocation(location);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfirm = useCallback(async () => {
    setIsRequesting(true);
    locationService.setPromptShown();

    // Request precise geolocation
    const position = await locationService.getCurrentPosition();
    setIsRequesting(false);
    onComplete(position !== null);
  }, [onComplete]);

  const handleDeny = useCallback(() => {
    locationService.setPromptShown();
    onComplete(false);
  }, [onComplete]);

  // Show loading state while fetching IP location
  if (isLoading) {
    return (
      <VaultPanel title="Add weather to notes?" helper="Detecting location...">
        <div className={styles.choices}>
          <Button
            className={styles.actionButton}
            variant="ghost"
            onClick={handleDeny}
          >
            Cancel
          </Button>
        </div>
      </VaultPanel>
    );
  }

  const locationText = ipLocation
    ? `${ipLocation.city}, ${ipLocation.country}`
    : null;

  const helperText = locationText
    ? `Looks like you're in ${locationText}. Is that right?`
    : "Share your location to add weather to your notes.";

  return (
    <VaultPanel title="Add weather to notes?" helper={helperText}>
      <div className={styles.choices}>
        <Button
          className={styles.actionButton}
          variant="primary"
          onClick={handleConfirm}
          disabled={isRequesting}
        >
          {isRequesting
            ? "Getting location..."
            : locationText
              ? "Yes, add weather"
              : "Allow location"}
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
  );
}

export function LocationPrompt({ isOpen, onComplete }: LocationPromptProps) {
  const handleDeny = useCallback(() => {
    locationService.setPromptShown();
    onComplete(false);
  }, [onComplete]);

  return (
    <Modal isOpen={isOpen} onClose={handleDeny}>
      {isOpen && <LocationPromptContent onComplete={onComplete} />}
    </Modal>
  );
}
