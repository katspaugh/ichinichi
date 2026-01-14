import { useState, useCallback } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export interface PWAState {
  needRefresh: boolean;
  offlineReady: boolean;
  updateServiceWorker: () => void;
  dismissUpdate: () => void;
}

export function usePWA(): PWAState {
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (registration) {
        // Check for updates every hour
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  const dismissUpdateCallback = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleUpdate = useCallback(() => {
    updateServiceWorker(true);
  }, [updateServiceWorker]);

  return {
    needRefresh: needRefresh && !dismissed,
    offlineReady,
    updateServiceWorker: handleUpdate,
    dismissUpdate: dismissUpdateCallback,
  };
}
