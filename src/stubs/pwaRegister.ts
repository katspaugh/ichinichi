import { useState } from "react";

export function useRegisterSW() {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: () => {},
  };
}
