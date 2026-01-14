export type SyncCoordinatorPhase = "disabled" | "offline" | "ready";

export interface SyncCoordinatorState {
  phase: SyncCoordinatorPhase;
  shouldSync: boolean;
}

export interface SyncCoordinatorInputs {
  enabled: boolean;
  online: boolean;
}

export type SyncCoordinatorEvent =
  | { type: "INPUTS_CHANGED"; inputs: SyncCoordinatorInputs }
  | { type: "SYNC_DISPATCHED" };

export const initialSyncCoordinatorState: SyncCoordinatorState = {
  phase: "disabled",
  shouldSync: false,
};

export function syncCoordinatorReducer(
  state: SyncCoordinatorState,
  event: SyncCoordinatorEvent,
): SyncCoordinatorState {
  switch (event.type) {
    case "INPUTS_CHANGED": {
      const { enabled, online } = event.inputs;
      if (!enabled) {
        if (state.phase === "disabled") {
          return state;
        }
        return { phase: "disabled", shouldSync: false };
      }
      if (!online) {
        if (state.phase === "offline") {
          return state;
        }
        return { phase: "offline", shouldSync: false };
      }
      const shouldSync = state.phase !== "ready";
      return { phase: "ready", shouldSync };
    }
    case "SYNC_DISPATCHED":
      if (!state.shouldSync) return state;
      return { ...state, shouldSync: false };
    default:
      return state;
  }
}
