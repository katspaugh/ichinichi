import { assign, setup } from "xstate";
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

export const syncStateMachine = setup({
  types: {
    context: {} as SyncMachineState,
    events: {} as SyncMachineEvent,
  },
}).createMachine({
  id: "syncState",
  initial: "disabled",
  context: initialSyncMachineState,
  states: {
    disabled: {
      id: "disabled",
      entry: assign({
        phase: "disabled",
        status: SyncStatus.Idle,
        intent: null,
      }),
      on: {
        INPUTS_CHANGED: [
          {
            guard: ({ event }) => event.inputs.enabled && event.inputs.online,
            target: "#ready",
            actions: assign({
              phase: "ready",
              status: SyncStatus.Idle,
              intent: { immediate: true },
            }),
          },
          {
            guard: ({ event }) => event.inputs.enabled && !event.inputs.online,
            target: "#offline",
            actions: assign({
              phase: "offline",
              status: SyncStatus.Offline,
              intent: null,
            }),
          },
        ],
      },
    },
    offline: {
      id: "offline",
      entry: assign({
        phase: "offline",
        status: SyncStatus.Offline,
        intent: null,
      }),
      on: {
        INPUTS_CHANGED: [
          {
            guard: ({ event }) => !event.inputs.enabled,
            target: "#disabled",
          },
          {
            guard: ({ event }) => event.inputs.enabled && event.inputs.online,
            target: "#ready",
            actions: assign({
              phase: "ready",
              status: SyncStatus.Idle,
              intent: { immediate: true },
            }),
          },
        ],
      },
    },
    ready: {
      id: "ready",
      entry: assign({ phase: "ready" }),
      on: {
        INPUTS_CHANGED: [
          {
            guard: ({ event }) => !event.inputs.enabled,
            target: "#disabled",
          },
          {
            guard: ({ event }) => !event.inputs.online,
            target: "#offline",
          },
        ],
        SYNC_REQUESTED: {
          actions: assign(({ event }) => ({ intent: event.intent })),
        },
        SYNC_DISPATCHED: {
          actions: assign({ intent: null }),
        },
        SYNC_STARTED: {
          target: "#syncing",
        },
        SYNC_FINISHED: {
          target: "#ready",
          actions: assign(({ event }) => ({
            status: event.status,
            intent: null,
          })),
        },
      },
    },
    syncing: {
      id: "syncing",
      entry: assign({
        phase: "syncing",
        status: SyncStatus.Syncing,
        intent: null,
      }),
      on: {
        SYNC_REQUESTED: {
          actions: assign({ intent: null }),
        },
        SYNC_FINISHED: [
          {
            guard: ({ event }) => event.status === SyncStatus.Offline,
            target: "#offline",
            actions: assign({
              status: SyncStatus.Offline,
              intent: null,
            }),
          },
          {
            guard: ({ event }) => event.status === SyncStatus.Error,
            target: "#error",
            actions: assign({ status: SyncStatus.Error, intent: null }),
          },
          {
            target: "#ready",
            actions: assign(({ event }) => ({
              status: event.status,
              intent: null,
            })),
          },
        ],
      },
    },
    error: {
      id: "error",
      entry: assign({ phase: "error", status: SyncStatus.Error, intent: null }),
      on: {
        INPUTS_CHANGED: [
          {
            guard: ({ event }) => !event.inputs.enabled,
            target: "#disabled",
          },
          {
            guard: ({ event }) => !event.inputs.online,
            target: "#offline",
          },
          {
            guard: ({ event }) => event.inputs.enabled && event.inputs.online,
            target: "#ready",
            actions: assign({
              phase: "ready",
              status: SyncStatus.Idle,
              intent: { immediate: true },
            }),
          },
        ],
      },
    },
  },
});
