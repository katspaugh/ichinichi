/* eslint-disable @typescript-eslint/no-explicit-any */
import { noteContentStore } from "../stores/noteContentStore";
import { syncStore } from "../stores/syncStore";
import { SyncStatus } from "../types";
import { ok } from "../domain/result";
import { syncDefaults } from "./helpers/mockNoteRepository";

jest.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: jest.fn(() => true),
    subscribe: jest.fn(() => () => {}),
  },
}));

import { connectivity } from "../services/connectivity";
const mockGetOnline = connectivity.getOnline as jest.Mock;

// Mock pendingOpsSource
jest.mock("../storage/pendingOpsSource", () => ({
  pendingOpsSource: {
    getSummary: jest.fn().mockResolvedValue({ notes: 0, images: 0, total: 0 }),
    hasPending: jest.fn().mockResolvedValue(false),
  },
}));

// Mock Supabase channel for syncStore tests
function createMockChannel(): any {
  const ch: any = {
    on: jest.fn().mockImplementation(() => ch),
    subscribe: jest.fn((cb: any) => {
      cb("SUBSCRIBED");
      return ch;
    }),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
  };
  return ch;
}

function createMockSupabase(): any {
  return { channel: jest.fn().mockReturnValue(createMockChannel()) };
}

function createRepository(initialContent = "") {
  return {
    ...syncDefaults,
    get: jest.fn().mockResolvedValue(ok({ content: initialContent, date: "16-01-2026" })),
    save: jest.fn().mockResolvedValue(ok(undefined)),
    delete: jest.fn().mockResolvedValue(ok(undefined)),
    getAllDates: jest.fn().mockResolvedValue(ok([])),
  };
}

const SAVE_IDLE_DELAY_MS = 2000;

/**
 * Tests for noteContentStore hasEdits / isSaving tracking.
 * (Replaces localNoteMachine tests)
 */
describe("noteContentStore — hasEdits tracking", () => {
  beforeEach(() => {
    mockGetOnline.mockReturnValue(true);
  });

  afterEach(async () => {
    await noteContentStore.getState().dispose();
  });

  it("sets hasEdits to true when content is edited", async () => {
    const repository = createRepository("");
    noteContentStore.getState().init("16-01-2026", repository);

    await new Promise((r) => setTimeout(r, 100));
    expect(noteContentStore.getState().status).toBe("ready");
    expect(noteContentStore.getState().hasEdits).toBe(false);

    noteContentStore.getState().setContent("modified content");

    expect(noteContentStore.getState().hasEdits).toBe(true);
    expect(noteContentStore.getState().content).toBe("modified content");
  });

  it("does not set hasEdits when content matches current", () => {
    // Pre-condition: need to be in ready state
    // Use synchronous check since setContent guards on current content
    const repository = createRepository("same content");
    noteContentStore.getState().init("16-01-2026", repository);

    return new Promise<void>((resolve) => {
      setTimeout(async () => {
        expect(noteContentStore.getState().status).toBe("ready");

        noteContentStore.getState().setContent("same content");

        expect(noteContentStore.getState().hasEdits).toBe(false);
        resolve();
      }, 100);
    });
  });

  it("keeps isSaving true during save, clears after save completes", async () => {
    let resolveSave!: (v: { ok: true; value: undefined }) => void;
    const repository = createRepository("");
    (repository.save as jest.Mock).mockImplementation(
      () => new Promise((r) => { resolveSave = r; }),
    );

    noteContentStore.getState().init("16-01-2026", repository);
    await new Promise((r) => setTimeout(r, 100));

    noteContentStore.getState().setContent("new content");
    expect(noteContentStore.getState().isSaving).toBe(true);
    expect(noteContentStore.getState().hasEdits).toBe(true);

    // Flush triggers save
    const flushPromise = noteContentStore.getState().flushSave();
    expect(noteContentStore.getState().isSaving).toBe(true);

    // Complete save
    resolveSave({ ok: true, value: undefined });
    await flushPromise;

    expect(noteContentStore.getState().hasEdits).toBe(false);
    expect(noteContentStore.getState().isSaving).toBe(false);
  });
});

describe("noteContentStore — idle save delay", () => {
  afterEach(async () => {
    await noteContentStore.getState().dispose();
  });

  it("waits for idle delay before saving and resets on continued edits", async () => {
    jest.useFakeTimers();
    const repository = createRepository("");
    noteContentStore.getState().init("16-01-2026", repository);

    await jest.advanceTimersByTimeAsync(100);

    noteContentStore.getState().setContent("draft");

    jest.advanceTimersByTime(SAVE_IDLE_DELAY_MS - 100);
    expect(repository.save).not.toHaveBeenCalled();

    noteContentStore.getState().setContent("draft with more text");

    jest.advanceTimersByTime(SAVE_IDLE_DELAY_MS - 100);
    expect(repository.save).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(200);
    expect(repository.save).toHaveBeenCalledWith(
      "16-01-2026",
      "draft with more text",
    );

    jest.useRealTimers();
  });
});

/**
 * Tests for syncStore status transitions.
 * (Replaces syncMachine tests)
 */
describe("syncStore", () => {
  afterEach(() => {
    syncStore.getState().dispose();
  });

  it("starts with Idle status and disabled", () => {
    expect(syncStore.getState().status).toBe(SyncStatus.Idle);
    expect(syncStore.getState().enabled).toBe(false);
  });

  it("transitions to enabled with correct online status on init", () => {
    mockGetOnline.mockReturnValue(true);
    const mockRepo = { sync: jest.fn() } as any;
    syncStore.getState().init({
      repository: mockRepo,
      userId: "user-123",
      supabase: createMockSupabase(),
    });

    expect(syncStore.getState().enabled).toBe(true);
    expect(syncStore.getState().online).toBe(true);
  });

  it("sets offline status when initialized offline", () => {
    mockGetOnline.mockReturnValue(false);
    const mockRepo = { sync: jest.fn() } as any;
    syncStore.getState().init({
      repository: mockRepo,
      userId: "user-123",
      supabase: createMockSupabase(),
    });

    expect(syncStore.getState().enabled).toBe(true);
    expect(syncStore.getState().status).toBe(SyncStatus.Offline);
  });

  it("resets to idle on dispose", () => {
    mockGetOnline.mockReturnValue(true);
    const mockRepo = { sync: jest.fn() } as any;
    syncStore.getState().init({
      repository: mockRepo,
      userId: "user-123",
      supabase: createMockSupabase(),
    });

    expect(syncStore.getState().enabled).toBe(true);

    syncStore.getState().dispose();

    expect(syncStore.getState().enabled).toBe(false);
    expect(syncStore.getState().status).toBe(SyncStatus.Idle);
  });

  it("updates connectivity and triggers sync when coming online", () => {
    mockGetOnline.mockReturnValue(false);
    const mockRepo = { sync: jest.fn() } as any;
    syncStore.getState().init({
      repository: mockRepo,
      userId: "user-123",
      supabase: createMockSupabase(),
    });

    expect(syncStore.getState().status).toBe(SyncStatus.Offline);

    mockGetOnline.mockReturnValue(true);
    syncStore.getState().updateConnectivity(true);

    expect(syncStore.getState().online).toBe(true);
    // Coming online triggers immediate sync, so status is no longer Offline
    expect(syncStore.getState().status).not.toBe(SyncStatus.Offline);
  });

  it("sets offline status when connectivity lost", () => {
    mockGetOnline.mockReturnValue(true);
    const mockRepo = { sync: jest.fn() } as any;
    syncStore.getState().init({
      repository: mockRepo,
      userId: "user-123",
      supabase: createMockSupabase(),
    });

    syncStore.getState().updateConnectivity(false);

    expect(syncStore.getState().online).toBe(false);
    expect(syncStore.getState().status).toBe(SyncStatus.Offline);
  });

  describe("realtime events", () => {
    it("clears lastRealtimeChangedDate via clearRealtimeChanged", () => {
      mockGetOnline.mockReturnValue(true);
      const mockRepo = { sync: jest.fn() } as any;
      syncStore.getState().init({
        repository: mockRepo,
        userId: "user-123",
        supabase: createMockSupabase(),
      });

      expect(syncStore.getState().lastRealtimeChangedDate).toBeNull();

      // The realtime channel listener would set this — simulate directly
      syncStore.setState({ lastRealtimeChangedDate: "15-01-2026" });
      expect(syncStore.getState().lastRealtimeChangedDate).toBe("15-01-2026");

      syncStore.getState().clearRealtimeChanged();
      expect(syncStore.getState().lastRealtimeChangedDate).toBeNull();
    });

    it("tracks realtimeConnected based on channel subscription", () => {
      mockGetOnline.mockReturnValue(true);
      const mockRepo = { sync: jest.fn() } as any;

      // Channel mock calls cb("SUBSCRIBED") synchronously
      syncStore.getState().init({
        repository: mockRepo,
        userId: "user-123",
        supabase: createMockSupabase(),
      });

      expect(syncStore.getState().realtimeConnected).toBe(true);
    });
  });

  describe("window focus sync", () => {
    it("handleWindowFocus triggers sync request", () => {
      mockGetOnline.mockReturnValue(true);
      const mockRepo = { sync: jest.fn() } as any;
      syncStore.getState().init({
        repository: mockRepo,
        userId: "user-123",
        supabase: createMockSupabase(),
      });

      // Should not throw
      syncStore.getState().handleWindowFocus();

      // No direct assertion on sync happening — relies on intentScheduler
      expect(syncStore.getState().enabled).toBe(true);
    });

    it("handleWindowFocus is no-op when disposed", () => {
      syncStore.getState().handleWindowFocus();
      // Should not throw
      expect(syncStore.getState().enabled).toBe(false);
    });
  });
});
