import { SyncStatus } from "../../types";

export type SyncPhase = "disabled" | "offline" | "ready" | "syncing" | "error";

export interface SyncIntent {
  immediate: boolean;
}

export interface SyncMachineState {
  phase: SyncPhase;
  status: SyncStatus;
  intent: SyncIntent | null;
}

export interface SyncMachineInputs {
  enabled: boolean;
  online: boolean;
}

export type SyncMachineEvent =
  | { type: "INPUTS_CHANGED"; inputs: SyncMachineInputs }
  | { type: "SYNC_REQUESTED"; intent: SyncIntent }
  | { type: "SYNC_DISPATCHED" }
  | { type: "SYNC_STARTED" }
  | { type: "SYNC_FINISHED"; status: SyncStatus };

export const initialSyncMachineState: SyncMachineState = {
  phase: "disabled",
  status: SyncStatus.Idle,
  intent: null,
};

function finishSync(status: SyncStatus): SyncMachineState {
  if (status === SyncStatus.Offline) {
    return { phase: "offline", status, intent: null };
  }
  if (status === SyncStatus.Error) {
    return { phase: "error", status, intent: null };
  }
  if (status === SyncStatus.Syncing) {
    return { phase: "syncing", status, intent: null };
  }
  return { phase: "ready", status, intent: null };
}

export function syncMachineReducer(
  state: SyncMachineState,
  event: SyncMachineEvent,
): SyncMachineState {
  switch (event.type) {
    case "INPUTS_CHANGED": {
      const { enabled, online } = event.inputs;
      if (!enabled) {
        return {
          phase: "disabled",
          status: SyncStatus.Idle,
          intent: null,
        };
      }
      if (!online) {
        return {
          phase: "offline",
          status: SyncStatus.Offline,
          intent: null,
        };
      }
      if (state.phase === "disabled" || state.phase === "offline") {
        return {
          phase: "ready",
          status: SyncStatus.Idle,
          intent: { immediate: true },
        };
      }
      return state;
    }
    case "SYNC_REQUESTED":
      if (state.phase === "disabled" || state.phase === "offline") {
        return state;
      }
      if (state.phase === "syncing") {
        return state;
      }
      return { ...state, intent: event.intent };
    case "SYNC_DISPATCHED":
      if (!state.intent) return state;
      return { ...state, intent: null };
    case "SYNC_STARTED":
      return { phase: "syncing", status: SyncStatus.Syncing, intent: null };
    case "SYNC_FINISHED":
      return finishSync(event.status);
    default:
      return state;
  }
}
