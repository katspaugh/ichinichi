import { SyncStatus } from "../types";
import { createActor } from "xstate";
import {
  initialSyncMachineState,
  syncStateMachine,
} from "../domain/sync/stateMachine";

describe("syncStateMachine", () => {
  it("moves to ready and requests immediate sync when enabled online", () => {
    const actor = createActor(syncStateMachine);
    actor.start();
    actor.send({
      type: "INPUTS_CHANGED",
      inputs: { enabled: true, online: true },
    });

    expect(actor.getSnapshot().context).toEqual({
      phase: "ready",
      status: SyncStatus.Idle,
      intent: { immediate: true },
    });
    actor.stop();
  });

  it("stays disabled when disabled inputs arrive", () => {
    const actor = createActor(syncStateMachine);
    actor.start();
    actor.send({
      type: "INPUTS_CHANGED",
      inputs: { enabled: false, online: true },
    });
    actor.start();
    actor.send({
      type: "INPUTS_CHANGED",
      inputs: { enabled: false, online: true },
    });

    expect(actor.getSnapshot().context).toEqual({
      phase: "disabled",
      status: SyncStatus.Idle,
      intent: null,
    });
    actor.stop();
  });

  it("enters offline state when inputs report offline", () => {
    const actor = createActor(syncStateMachine);
    actor.start();
    actor.send({
      type: "INPUTS_CHANGED",
      inputs: { enabled: true, online: true },
    });
    actor.send({
      type: "INPUTS_CHANGED",
      inputs: { enabled: true, online: false },
    });

    expect(actor.getSnapshot().context).toEqual({
      phase: "offline",
      status: SyncStatus.Offline,
      intent: null,
    });
    actor.stop();
  });

  it("records a sync intent when requested while ready", () => {
    const actor = createActor(syncStateMachine);
    actor.start();
    actor.send({
      type: "INPUTS_CHANGED",
      inputs: { enabled: true, online: true },
    });
    actor.send({ type: "SYNC_REQUESTED", intent: { immediate: false } });

    expect(actor.getSnapshot().context).toEqual({
      phase: "ready",
      status: SyncStatus.Idle,
      intent: { immediate: false },
    });
    actor.stop();
  });

  it("ignores sync requests while disabled", () => {
    const actor = createActor(syncStateMachine);
    actor.start();
    actor.send({ type: "SYNC_REQUESTED", intent: { immediate: true } });

    expect(actor.getSnapshot().context).toEqual(initialSyncMachineState);
    actor.stop();
  });

  it("marks syncing when sync starts", () => {
    const actor = createActor(syncStateMachine);
    actor.start();
    actor.send({
      type: "INPUTS_CHANGED",
      inputs: { enabled: true, online: true },
    });
    actor.send({ type: "SYNC_STARTED" });

    expect(actor.getSnapshot().context).toEqual({
      phase: "syncing",
      status: SyncStatus.Syncing,
      intent: null,
    });
    actor.stop();
  });

  it("clears intent when sync is dispatched", () => {
    const actor = createActor(syncStateMachine);
    actor.start();
    actor.send({
      type: "INPUTS_CHANGED",
      inputs: { enabled: true, online: true },
    });
    actor.send({ type: "SYNC_REQUESTED", intent: { immediate: false } });
    actor.send({ type: "SYNC_DISPATCHED" });

    expect(actor.getSnapshot().context).toEqual({
      phase: "ready",
      status: SyncStatus.Idle,
      intent: null,
    });
    actor.stop();
  });

  it("returns to ready when sync finishes successfully", () => {
    const actor = createActor(syncStateMachine);
    actor.start();
    actor.send({
      type: "INPUTS_CHANGED",
      inputs: { enabled: true, online: true },
    });
    actor.send({ type: "SYNC_STARTED" });
    actor.send({ type: "SYNC_FINISHED", status: SyncStatus.Synced });

    expect(actor.getSnapshot().context).toEqual({
      phase: "ready",
      status: SyncStatus.Synced,
      intent: null,
    });
    actor.stop();
  });

  it("moves to error when sync fails", () => {
    const actor = createActor(syncStateMachine);
    actor.start();
    actor.send({
      type: "INPUTS_CHANGED",
      inputs: { enabled: true, online: true },
    });
    actor.send({ type: "SYNC_STARTED" });
    actor.send({ type: "SYNC_FINISHED", status: SyncStatus.Error });

    expect(actor.getSnapshot().context).toEqual({
      phase: "error",
      status: SyncStatus.Error,
      intent: null,
    });
    actor.stop();
  });
});
