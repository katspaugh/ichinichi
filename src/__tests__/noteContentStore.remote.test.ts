/* eslint-disable @typescript-eslint/no-explicit-any */
import { noteContentStore } from "../stores/noteContentStore";
import { ok } from "../domain/result";
import { syncDefaults } from "./helpers/mockNoteRepository";

let mockOnline = true;
jest.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: () => mockOnline,
    subscribe: jest.fn(() => () => {}),
  },
}));

function createRepository(initialContent = ""): any {
  return {
    ...syncDefaults,
    syncCapable: true,
    get: jest.fn().mockResolvedValue(
      ok({
        date: "10-01-2026",
        content: initialContent,
        updatedAt: "2026-01-10T10:00:00.000Z",
      }),
    ),
    save: jest.fn().mockResolvedValue(ok(undefined)),
    delete: jest.fn().mockResolvedValue(ok(undefined)),
    getAllDates: jest.fn().mockResolvedValue(ok([])),
    refreshNote: jest.fn().mockResolvedValue(
      ok({ date: "10-01-2026", content: "remote-content", updatedAt: "2026-01-10T11:00:00.000Z" }),
    ),
    hasRemoteDateCached: jest.fn().mockResolvedValue(true),
    hasPendingOp: jest.fn().mockResolvedValue(false),
  };
}

async function waitForStatus(
  status: string,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (noteContentStore.getState().status !== status) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timed out waiting for status "${status}", got "${noteContentStore.getState().status}"`,
      );
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("noteContentStore remote refresh", () => {
  beforeEach(() => {
    mockOnline = true;
  });

  afterEach(async () => {
    await noteContentStore.getState().dispose();
  });

  it("auto-refreshes from remote after load", async () => {
    const repository = createRepository("local");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");

    // Wait for auto-triggered refreshFromRemote
    await new Promise((r) => setTimeout(r, 100));

    expect(repository.refreshNote).toHaveBeenCalledWith("10-01-2026");
    // Remote content applied since no local edits
    expect(noteContentStore.getState().content).toBe("remote-content");
  });

  it("refreshes even when local content is empty", async () => {
    const repository = createRepository("");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");
    await new Promise((r) => setTimeout(r, 100));

    expect(repository.refreshNote).toHaveBeenCalledWith("10-01-2026");
    expect(noteContentStore.getState().content).toBe("remote-content");
  });

  it("forceRefresh triggers refresh even after initial refresh completed", async () => {
    const repository = createRepository("local");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");
    await new Promise((r) => setTimeout(r, 100));

    // Initial refresh done
    expect(repository.refreshNote).toHaveBeenCalledTimes(1);

    repository.refreshNote.mockClear();
    repository.refreshNote.mockResolvedValue(
      ok({ date: "10-01-2026", content: "refreshed-again", updatedAt: "2026-01-10T12:00:00.000Z" }),
    );

    noteContentStore.getState().forceRefresh();
    await new Promise((r) => setTimeout(r, 100));

    expect(repository.refreshNote).toHaveBeenCalledWith("10-01-2026");
    expect(noteContentStore.getState().content).toBe("refreshed-again");
  });

  it("forceRefresh does not apply update when user has local edits", async () => {
    const repository = createRepository("local");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");
    await new Promise((r) => setTimeout(r, 100));

    // Clear and set up for second refresh
    repository.refreshNote.mockClear();
    repository.refreshNote.mockResolvedValue(
      ok({ date: "10-01-2026", content: "should-not-apply", updatedAt: "2026-01-10T12:00:00.000Z" }),
    );

    // Make local edits
    noteContentStore.getState().setContent("my-edits");

    noteContentStore.getState().forceRefresh();
    await new Promise((r) => setTimeout(r, 100));

    // refreshNote is called but content not applied due to edits
    expect(repository.refreshNote).toHaveBeenCalled();
    expect(noteContentStore.getState().content).toBe("my-edits");
  });

  it("retries refresh when previous refresh returned null", async () => {
    const repository = createRepository("local");
    // First refresh returns null
    repository.refreshNote.mockResolvedValueOnce(ok(null));

    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");
    await new Promise((r) => setTimeout(r, 100));

    expect(repository.refreshNote).toHaveBeenCalledTimes(1);
    // Content unchanged (null result → no update, hasRefreshedForDate set)
    expect(noteContentStore.getState().content).toBe("local");

    // Force refresh should retry
    repository.refreshNote.mockResolvedValueOnce(
      ok({ date: "10-01-2026", content: "remote-content", updatedAt: "2026-01-10T11:00:00.000Z" }),
    );

    noteContentStore.getState().forceRefresh();
    await new Promise((r) => setTimeout(r, 100));

    expect(repository.refreshNote).toHaveBeenCalledTimes(2);
    expect(noteContentStore.getState().content).toBe("remote-content");
  });

  it("retries refresh when previous refresh errored", async () => {
    const repository = createRepository("local");
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    // First refresh throws
    repository.refreshNote.mockRejectedValueOnce(new Error("network error"));

    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");
    await new Promise((r) => setTimeout(r, 100));

    expect(repository.refreshNote).toHaveBeenCalledTimes(1);

    // Force refresh should retry
    repository.refreshNote.mockResolvedValueOnce(
      ok({ date: "10-01-2026", content: "remote-content", updatedAt: "2026-01-10T11:00:00.000Z" }),
    );

    noteContentStore.getState().forceRefresh();
    await new Promise((r) => setTimeout(r, 100));

    expect(repository.refreshNote).toHaveBeenCalledTimes(2);
    expect(noteContentStore.getState().content).toBe("remote-content");

    consoleSpy.mockRestore();
  });

  it("exposes known remote-only notes via remoteCacheResult when offline", async () => {
    mockOnline = false;
    const repository = createRepository("");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");
    await new Promise((r) => setTimeout(r, 100));

    const { remoteCacheResult } = noteContentStore.getState();
    expect(remoteCacheResult).toEqual({ date: "10-01-2026", hasRemote: true });
  });

  it("does not auto-retry after successful refresh on re-init with same date", async () => {
    const repository = createRepository("local");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");
    await new Promise((r) => setTimeout(r, 100));

    // Initial refresh done
    expect(repository.refreshNote).toHaveBeenCalledTimes(1);
    expect(noteContentStore.getState().hasRefreshedForDate).toBe("10-01-2026");

    // Second refreshFromRemote should skip (hasRefreshedForDate matches)
    repository.refreshNote.mockClear();
    await noteContentStore.getState().refreshFromRemote();

    expect(repository.refreshNote).not.toHaveBeenCalled();
  });
});
