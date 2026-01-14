import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import {
  initialSyncCoordinatorState,
  syncCoordinatorReducer,
  type SyncCoordinatorInputs,
} from "../domain/sync/coordinator";

interface UseSyncCoordinatorResult {
  phase: "disabled" | "offline" | "ready";
  shouldSync: boolean;
  consumeSyncIntent: () => void;
}

export function useSyncCoordinator(
  enabled: boolean,
): UseSyncCoordinatorResult {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [state, dispatch] = useReducer(
    syncCoordinatorReducer,
    initialSyncCoordinatorState,
  );
  const inputs: SyncCoordinatorInputs = useMemo(
    () => ({ enabled, online }),
    [enabled, online],
  );

  useEffect(() => {
    dispatch({ type: "INPUTS_CHANGED", inputs });
  }, [inputs]);

  useEffect(() => {
    const handleOffline = () => setOnline(false);
    const handleOnline = () => setOnline(true);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const consumeSyncIntent = useCallback(() => {
    dispatch({ type: "SYNC_DISPATCHED" });
  }, []);

  return {
    phase: state.phase,
    shouldSync: state.shouldSync,
    consumeSyncIntent,
  };
}
