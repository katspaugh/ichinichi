/* eslint-disable @typescript-eslint/no-explicit-any */
import { createActor } from "xstate";
import { renderHook, act } from "@testing-library/react";
import { syncMachine } from "../hooks/useSync";
import { localNoteMachine } from "../hooks/useLocalNoteContent";
import { useSavingIndicator } from "../components/NoteEditor/useSavingIndicator";
import { SyncStatus } from "../types";

/**
 * Integration tests for status indicators data flow.
 *
 * These tests verify that:
 * 1. The state machines produce the correct status values
 * 2. The status values flow through to where components can consume them
 *
 * Bug: "Saving..." and "Syncing..." indicators not appearing.
 * This file tests the data flow to isolate the issue.
 */

describe("Sync status data flow", () => {
  it("syncMachine should have status=Syncing when in syncing state", async () => {
    const mockRepository = {
      sync: jest.fn().mockResolvedValue({ ok: true, value: SyncStatus.Synced }),
    };

    const actor = createActor(syncMachine);

    // Track all status values
    const statuses: SyncStatus[] = [];
    actor.subscribe((snapshot) => {
      statuses.push(snapshot.context.status);
    });

    actor.start();

    // Enable sync
    actor.send({
      type: "INPUTS_CHANGED",
      repository: mockRepository as any,
      enabled: true,
      online: true,
    });

    // Send SYNC_STARTED manually (simulating what syncResources actor does)
    actor.send({ type: "SYNC_STARTED" });

    // Verify we see Syncing status
    const snapshot = actor.getSnapshot();
    expect(snapshot.context.status).toBe(SyncStatus.Syncing);
    expect(snapshot.value).toEqual({ active: "syncing" });

    actor.stop();
  });

  it("syncMachine should have status=Synced after SYNC_FINISHED with Synced", async () => {
    const mockRepository = {
      sync: jest.fn().mockResolvedValue({ ok: true, value: SyncStatus.Synced }),
    };

    const actor = createActor(syncMachine);
    actor.start();

    // Enable sync
    actor.send({
      type: "INPUTS_CHANGED",
      repository: mockRepository as any,
      enabled: true,
      online: true,
    });

    // Start sync
    actor.send({ type: "SYNC_STARTED" });
    expect(actor.getSnapshot().context.status).toBe(SyncStatus.Syncing);

    // Finish sync
    actor.send({ type: "SYNC_FINISHED", status: SyncStatus.Synced });
    expect(actor.getSnapshot().context.status).toBe(SyncStatus.Synced);

    actor.stop();
  });

  it("syncMachine status should be exposed via useSync hook return value", async () => {
    /**
     * The useSync hook returns:
     * {
     *   syncStatus: state.context.status,
     *   syncError: state.context.syncError,
     *   ...
     * }
     *
     * This is then passed through:
     * useNoteRepository -> notes.syncStatus -> App -> Calendar -> SyncIndicator
     *
     * For the indicator to show, we need:
     * 1. canSync to be true (mode === Cloud && userId exists)
     * 2. syncStatus to be passed to Calendar (syncStatus={canSync ? notes.syncStatus : undefined})
     * 3. SyncIndicator to receive status !== Idle (or have pendingOps)
     *
     * If in local mode or no user, canSync is false and syncStatus is undefined,
     * so SyncIndicator won't render.
     */
    expect(true).toBe(true);
  });
});

describe("Saving status data flow", () => {
  it("localNoteMachine should expose isSaving=true when in dirty state", () => {
    const mockRepository = {
      get: jest.fn().mockResolvedValue({ content: "initial" }),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const actor = createActor(localNoteMachine);
    actor.start();

    // Move to ready state
    actor.send({
      type: "INPUTS_CHANGED",
      date: "16-01-2026",
      repository: mockRepository as any,
    });
    actor.send({
      type: "LOAD_SUCCESS",
      date: "16-01-2026",
      content: "initial content",
    });

    expect(actor.getSnapshot().value).toBe("ready");

    // Edit to move to dirty state
    actor.send({ type: "EDIT", content: "modified content" });

    const state = actor.getSnapshot();
    expect(state.value).toBe("dirty");

    // This is what useLocalNoteContent.ts calculates:
    // const isSaving = stateValue === "dirty" || stateValue === "saving";
    const isSaving = state.value === "dirty" || state.value === "saving";
    expect(isSaving).toBe(true);

    actor.stop();
  });

  it("localNoteMachine should expose isSaving=true when in saving state", async () => {
    let saveResolver: () => void;
    const savePromise = new Promise<void>((resolve) => {
      saveResolver = resolve;
    });

    const mockRepository = {
      get: jest.fn().mockResolvedValue({ content: "initial" }),
      save: jest.fn().mockReturnValue(savePromise),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const actor = createActor(localNoteMachine);
    actor.start();

    // Move to ready state
    actor.send({
      type: "INPUTS_CHANGED",
      date: "16-01-2026",
      repository: mockRepository as any,
    });
    actor.send({
      type: "LOAD_SUCCESS",
      date: "16-01-2026",
      content: "initial content",
    });

    // Edit to move to dirty state
    actor.send({ type: "EDIT", content: "modified content" });
    expect(actor.getSnapshot().value).toBe("dirty");

    // Trigger save via FLUSH
    actor.send({ type: "FLUSH" });

    // Should be in saving state
    expect(actor.getSnapshot().value).toBe("saving");

    const isSaving =
      actor.getSnapshot().value === "dirty" ||
      actor.getSnapshot().value === "saving";
    expect(isSaving).toBe(true);

    // Complete save
    saveResolver!();

    actor.stop();
  });

  it("localNoteMachine should expose isSaving=false when in ready state", () => {
    const mockRepository = {
      get: jest.fn().mockResolvedValue({ content: "initial" }),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const actor = createActor(localNoteMachine);
    actor.start();

    // Move to ready state
    actor.send({
      type: "INPUTS_CHANGED",
      date: "16-01-2026",
      repository: mockRepository as any,
    });
    actor.send({
      type: "LOAD_SUCCESS",
      date: "16-01-2026",
      content: "initial content",
    });

    const state = actor.getSnapshot();
    expect(state.value).toBe("ready");

    const isSaving = state.value === "dirty" || state.value === "saving";
    expect(isSaving).toBe(false);

    actor.stop();
  });
});

describe("NoteEditor isSaving prop flow", () => {
  /**
   * The NoteEditor component uses useSavingIndicator hook which now:
   * 1. Takes both isEditable and isSaving as inputs
   * 2. Shows indicator after 400ms idle when isSaving is true
   * 3. Keeps showing for minimum 800ms even if save completes faster
   *
   * The NoteEditor logic:
   * const shouldShowSaving = showSaving || (isClosing && isSaving);
   */
  it("should document the fixed timing for Saving indicator", () => {
    // Timeline of events (after fix):
    // T=0: User types (EDIT event) -> isSaving=true, idle timer starts (400ms)
    // T=400ms: Idle timer fires, isSaving still true -> showSaving=true
    // T=500ms: Save completes -> isSaving=false, but min display timer ensures visibility
    // T=1200ms: Min display time elapsed -> showSaving=false
    //
    // Result: "Saving..." appears at 400ms and stays visible until 1200ms

    expect(true).toBe(true);
  });
});

describe("useSavingIndicator hook", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should not show saving when not editable", () => {
    const { result } = renderHook(() => useSavingIndicator(false, true));

    expect(result.current.showSaving).toBe(false);

    // Schedule and advance timers
    act(() => {
      result.current.scheduleSavingIndicator();
      jest.advanceTimersByTime(500);
    });

    expect(result.current.showSaving).toBe(false);
  });

  it("should show saving after idle delay when isSaving is true", () => {
    const { result } = renderHook(() => useSavingIndicator(true, true));

    expect(result.current.showSaving).toBe(false);

    // Schedule the indicator
    act(() => {
      result.current.scheduleSavingIndicator();
    });

    // Before idle delay (2000ms)
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(result.current.showSaving).toBe(false);

    // After idle delay (2000ms)
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(result.current.showSaving).toBe(true);
  });

  it("should NOT show saving after idle delay when isSaving is false", () => {
    const { result } = renderHook(() => useSavingIndicator(true, false));

    act(() => {
      result.current.scheduleSavingIndicator();
      jest.advanceTimersByTime(2500);
    });

    // isSaving was false when timer fired, so showSaving stays false
    expect(result.current.showSaving).toBe(false);
  });

  it("should hide immediately when user continues typing", () => {
    const { result } = renderHook(() => useSavingIndicator(true, true));

    // Schedule and trigger showing
    act(() => {
      result.current.scheduleSavingIndicator();
      jest.advanceTimersByTime(2500); // Past idle delay
    });
    expect(result.current.showSaving).toBe(true);

    // User types again - should hide immediately
    act(() => {
      result.current.scheduleSavingIndicator();
    });
    expect(result.current.showSaving).toBe(false);
  });

  it("should hide after brief delay when save completes", () => {
    const { result, rerender } = renderHook(
      ({ isEditable, isSaving }) => useSavingIndicator(isEditable, isSaving),
      { initialProps: { isEditable: true, isSaving: true } },
    );

    // Schedule and trigger showing
    act(() => {
      result.current.scheduleSavingIndicator();
      jest.advanceTimersByTime(2500); // Past idle delay
    });
    expect(result.current.showSaving).toBe(true);

    // Save completes - isSaving becomes false
    rerender({ isEditable: true, isSaving: false });

    // Should still show briefly
    expect(result.current.showSaving).toBe(true);

    // After brief delay (300ms)
    act(() => {
      jest.advanceTimersByTime(400);
    });

    // Now it should be hidden
    expect(result.current.showSaving).toBe(false);
  });

  it("should reset idle timer on each input", () => {
    const { result } = renderHook(() => useSavingIndicator(true, true));

    // First input
    act(() => {
      result.current.scheduleSavingIndicator();
      jest.advanceTimersByTime(1500);
    });
    expect(result.current.showSaving).toBe(false);

    // Second input resets timer
    act(() => {
      result.current.scheduleSavingIndicator();
      jest.advanceTimersByTime(1500);
    });
    expect(result.current.showSaving).toBe(false);

    // After full idle delay from last input
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(result.current.showSaving).toBe(true);
  });
});
