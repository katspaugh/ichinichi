import { SyncStatus } from "../types";
import {
  initialSyncMachineState,
  syncMachineReducer,
  type SyncMachineState,
} from "../domain/sync/stateMachine";

describe("syncMachineReducer", () => {
  it("moves to ready and requests immediate sync when enabled online", () => {
    const next = syncMachineReducer(initialSyncMachineState, {
      type: "INPUTS_CHANGED",
      inputs: { enabled: true, online: true },
    });

    expect(next).toEqual({
      phase: "ready",
      status: SyncStatus.Idle,
      intent: { immediate: true },
    });
  });

  it("stays disabled when disabled inputs arrive", () => {
    const next = syncMachineReducer(initialSyncMachineState, {
      type: "INPUTS_CHANGED",
      inputs: { enabled: false, online: true },
    });

    expect(next).toEqual({
      phase: "disabled",
      status: SyncStatus.Idle,
      intent: null,
    });
  });

  it("enters offline state when inputs report offline", () => {
    const ready: SyncMachineState = {
      phase: "ready",
      status: SyncStatus.Idle,
      intent: null,
    };
    const next = syncMachineReducer(ready, {
      type: "INPUTS_CHANGED",
      inputs: { enabled: true, online: false },
    });

    expect(next).toEqual({
      phase: "offline",
      status: SyncStatus.Offline,
      intent: null,
    });
  });

  it("records a sync intent when requested while ready", () => {
    const ready: SyncMachineState = {
      phase: "ready",
      status: SyncStatus.Idle,
      intent: null,
    };
    const next = syncMachineReducer(ready, {
      type: "SYNC_REQUESTED",
      intent: { immediate: false },
    });

    expect(next).toEqual({
      phase: "ready",
      status: SyncStatus.Idle,
      intent: { immediate: false },
    });
  });

  it("ignores sync requests while disabled", () => {
    const next = syncMachineReducer(initialSyncMachineState, {
      type: "SYNC_REQUESTED",
      intent: { immediate: true },
    });

    expect(next).toEqual(initialSyncMachineState);
  });

  it("marks syncing when sync starts", () => {
    const ready: SyncMachineState = {
      phase: "ready",
      status: SyncStatus.Idle,
      intent: { immediate: true },
    };
    const next = syncMachineReducer(ready, { type: "SYNC_STARTED" });

    expect(next).toEqual({
      phase: "syncing",
      status: SyncStatus.Syncing,
      intent: null,
    });
  });

  it("clears intent when sync is dispatched", () => {
    const withIntent: SyncMachineState = {
      phase: "ready",
      status: SyncStatus.Idle,
      intent: { immediate: false },
    };
    const next = syncMachineReducer(withIntent, { type: "SYNC_DISPATCHED" });

    expect(next).toEqual({
      phase: "ready",
      status: SyncStatus.Idle,
      intent: null,
    });
  });

  it("returns to ready when sync finishes successfully", () => {
    const syncing: SyncMachineState = {
      phase: "syncing",
      status: SyncStatus.Syncing,
      intent: null,
    };
    const next = syncMachineReducer(syncing, {
      type: "SYNC_FINISHED",
      status: SyncStatus.Synced,
    });

    expect(next).toEqual({
      phase: "ready",
      status: SyncStatus.Synced,
      intent: null,
    });
  });

  it("moves to error when sync fails", () => {
    const syncing: SyncMachineState = {
      phase: "syncing",
      status: SyncStatus.Syncing,
      intent: null,
    };
    const next = syncMachineReducer(syncing, {
      type: "SYNC_FINISHED",
      status: SyncStatus.Error,
    });

    expect(next).toEqual({
      phase: "error",
      status: SyncStatus.Error,
      intent: null,
    });
  });
});
