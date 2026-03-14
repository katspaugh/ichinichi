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
