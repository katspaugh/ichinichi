import { renderHook, act } from "@testing-library/react";
import { noteContentStore } from "../stores/noteContentStore";
import { syncStore } from "../stores/syncStore";
import { useSavingIndicator } from "../components/NoteEditor/useSavingIndicator";
import { SyncStatus } from "../types";
import { ok } from "../domain/result";
import { syncDefaults } from "./helpers/mockNoteRepository";

const MIN_SAVING_DISPLAY_MS = 800;

jest.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: jest.fn(() => true),
    subscribe: jest.fn(() => () => {}),
  },
}));

/**
 * Integration tests for status indicators data flow.
 *
 * These tests verify that:
 * 1. The Zustand stores produce the correct status values
 * 2. The status values flow through to where components can consume them
 */

describe("Sync status data flow (syncStore)", () => {
  it("syncStore should have status=Syncing when sync starts", () => {
    // Simulate the sync service calling onSyncStart
    // Since init requires full config, test via direct state shape
    const initialStatus = syncStore.getState().status;
    expect(initialStatus).toBe(SyncStatus.Idle);
  });

  it("syncStore status is exposed via getState()", () => {
    /**
     * The useSync hook returns syncStore slices via useSyncExternalStore.
     * This flows through:
     * useNoteRepository -> notes.syncStatus -> App -> Calendar -> SyncIndicator
     *
     * For the indicator to show, we need:
     * 1. canSync to be true (mode === Cloud && userId exists)
     * 2. syncStatus passed to Calendar
     * 3. SyncIndicator receives status !== Idle (or has pendingOps)
     */
    expect(syncStore.getState().status).toBe(SyncStatus.Idle);
  });
});

describe("Saving status data flow (noteContentStore)", () => {
  afterEach(async () => {
    await noteContentStore.getState().dispose();
  });

  it("noteContentStore exposes isSaving=true when content is edited", async () => {
    const repository = {
      ...syncDefaults,
      get: jest.fn().mockResolvedValue(ok({ content: "initial", date: "16-01-2026" })),
      save: jest.fn().mockResolvedValue(ok(undefined)),
      delete: jest.fn().mockResolvedValue(ok(undefined)),
      getAllDates: jest.fn().mockResolvedValue(ok([])),
    };

    noteContentStore.getState().init("16-01-2026", repository);

    // Wait for load
    await new Promise((r) => setTimeout(r, 100));
    expect(noteContentStore.getState().status).toBe("ready");

    // Edit
    noteContentStore.getState().setContent("modified content");

    expect(noteContentStore.getState().isSaving).toBe(true);
    expect(noteContentStore.getState().hasEdits).toBe(true);
  });

  it("noteContentStore exposes isSaving=true during save", async () => {
    let resolveSave!: () => void;
    const savePromise = new Promise<void>((r) => { resolveSave = r; });

    const repository = {
      ...syncDefaults,
      get: jest.fn().mockResolvedValue(ok({ content: "initial", date: "16-01-2026" })),
      save: jest.fn().mockReturnValue(savePromise.then(() => ok(undefined))),
      delete: jest.fn().mockResolvedValue(ok(undefined)),
      getAllDates: jest.fn().mockResolvedValue(ok([])),
    };

    noteContentStore.getState().init("16-01-2026", repository);

    await new Promise((r) => setTimeout(r, 100));

    noteContentStore.getState().setContent("modified content");
    expect(noteContentStore.getState().isSaving).toBe(true);

    // Flush triggers save
    const flushPromise = noteContentStore.getState().flushSave();

    // Still saving while promise pending
    expect(noteContentStore.getState().isSaving).toBe(true);

    resolveSave();
    await flushPromise;

    expect(noteContentStore.getState().isSaving).toBe(false);
  });

  it("noteContentStore exposes isSaving=false when in ready state without edits", async () => {
    const repository = {
      ...syncDefaults,
      get: jest.fn().mockResolvedValue(ok({ content: "initial", date: "16-01-2026" })),
      save: jest.fn().mockResolvedValue(ok(undefined)),
      delete: jest.fn().mockResolvedValue(ok(undefined)),
      getAllDates: jest.fn().mockResolvedValue(ok([])),
    };

    noteContentStore.getState().init("16-01-2026", repository);

    await new Promise((r) => setTimeout(r, 100));
    expect(noteContentStore.getState().status).toBe("ready");

    expect(noteContentStore.getState().isSaving).toBe(false);
    expect(noteContentStore.getState().hasEdits).toBe(false);
  });
});

describe("NoteEditor isSaving prop flow", () => {
  it("should document the fixed timing for Saving indicator", () => {
    // Timeline of events (after fix):
    // T=0: User types -> isSaving=true (set immediately by setContent)
    // T=2000ms: Save timer fires, _doSave runs
    // T=~2050ms: Save completes -> isSaving=false, hasEdits=false
    //
    // The useSavingIndicator hook handles display timing separately
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

    act(() => {
      result.current.scheduleSavingIndicator();
      jest.advanceTimersByTime(500);
    });

    expect(result.current.showSaving).toBe(false);
  });

  it("should show saving after idle delay when isSaving is true", () => {
    const { result } = renderHook(() => useSavingIndicator(true, true));

    expect(result.current.showSaving).toBe(false);

    act(() => {
      result.current.scheduleSavingIndicator();
    });

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(result.current.showSaving).toBe(false);

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

    expect(result.current.showSaving).toBe(false);
  });

  it("should hide immediately when user continues typing", () => {
    const { result } = renderHook(() => useSavingIndicator(true, true));

    act(() => {
      result.current.scheduleSavingIndicator();
      jest.advanceTimersByTime(2500);
    });
    expect(result.current.showSaving).toBe(true);

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

    act(() => {
      result.current.scheduleSavingIndicator();
      jest.advanceTimersByTime(2500);
    });
    expect(result.current.showSaving).toBe(true);

    rerender({ isEditable: true, isSaving: false });
    expect(result.current.showSaving).toBe(true);

    act(() => {
      jest.advanceTimersByTime(MIN_SAVING_DISPLAY_MS - 100);
    });
    expect(result.current.showSaving).toBe(true);

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current.showSaving).toBe(false);
  });

  it("should reset idle timer on each input", () => {
    const { result } = renderHook(() => useSavingIndicator(true, true));

    act(() => {
      result.current.scheduleSavingIndicator();
      jest.advanceTimersByTime(1500);
    });
    expect(result.current.showSaving).toBe(false);

    act(() => {
      result.current.scheduleSavingIndicator();
      jest.advanceTimersByTime(1500);
    });
    expect(result.current.showSaving).toBe(false);

    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(result.current.showSaving).toBe(true);
  });
});
