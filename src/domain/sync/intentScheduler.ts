import type { PendingOpsSource } from "./pendingOpsSource";
import { hasPendingOps } from "./syncService";
import type { SyncMachineEvent, SyncIntent } from "./stateMachine";

interface SyncIntentScheduler {
  requestSync: (intent: SyncIntent) => void;
  requestIdleSync: (options?: { delayMs?: number }) => void;
  dispose: () => void;
}

const DEFAULT_DEBOUNCE_MS = 2000;
const DEFAULT_IDLE_DELAY_MS = 4000;

export function createSyncIntentScheduler(
  dispatch: (event: SyncMachineEvent) => void,
  pendingOpsSource: PendingOpsSource,
): SyncIntentScheduler {
  let debounceTimer: number | null = null;
  let idleTimer: number | null = null;

  const clearTimer = (timer: number | null) => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  };

  const requestSync = (intent: SyncIntent) => {
    clearTimer(debounceTimer);
    debounceTimer = null;

    if (intent.immediate) {
      dispatch({ type: "SYNC_REQUESTED", intent });
      return;
    }

    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      dispatch({ type: "SYNC_REQUESTED", intent });
    }, DEFAULT_DEBOUNCE_MS);
  };

  const requestIdleSync = (options?: { delayMs?: number }) => {
    if (idleTimer !== null) {
      return;
    }
    idleTimer = window.setTimeout(async () => {
      idleTimer = null;
      if (await hasPendingOps(pendingOpsSource)) {
        requestSync({ immediate: true });
      }
    }, options?.delayMs ?? DEFAULT_IDLE_DELAY_MS);
  };

  const dispose = () => {
    clearTimer(debounceTimer);
    clearTimer(idleTimer);
    debounceTimer = null;
    idleTimer = null;
  };

  return {
    requestSync,
    requestIdleSync,
    dispose,
  };
}
