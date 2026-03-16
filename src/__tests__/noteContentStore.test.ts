// @vitest-environment jsdom
import type { Mock } from "vitest";
import { noteContentStore } from "../stores/noteContentStore";
import { ok, err } from "../domain/result";
import type { NoteRepository } from "../storage/noteRepository";
import type { RepositoryError } from "../domain/errors";
import { syncDefaults } from "./helpers/mockNoteRepository";

// Mock connectivity as online by default
let mockOnline = true;
vi.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: () => mockOnline,
    subscribe: vi.fn(() => () => {}),
  },
}));

function createRepository(initialContent = ""): NoteRepository {
  return {
    ...syncDefaults,
    get: vi.fn().mockResolvedValue(
      ok({
        date: "10-01-2026",
        content: initialContent,
        updatedAt: "2026-01-10T10:00:00.000Z",
      }),
    ),
    save: vi.fn().mockResolvedValue(ok(undefined)),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    getAllDates: vi.fn().mockResolvedValue(ok([])),
  };
}

/** Wait for store to reach a status */
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

describe("noteContentStore", () => {
  beforeEach(() => {
    mockOnline = true;
  });

  afterEach(async () => {
    await noteContentStore.getState().dispose();
  });

  it("flushes pending edits when switching notes", async () => {
    const repository = createRepository("initial");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");

    noteContentStore.getState().setContent("draft");
    expect(noteContentStore.getState().hasEdits).toBe(true);

    await noteContentStore.getState().switchNote("11-01-2026");

    expect(repository.save).toHaveBeenCalledWith(
      "10-01-2026",
      "draft",
      null,
    );
  });

  it("ignores remote updates while edits exist", async () => {
    const repository = createRepository("initial");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");

    noteContentStore.getState().setContent("draft");
    noteContentStore.getState().applyRemoteUpdate("remote");

    expect(noteContentStore.getState().content).toBe("draft");
    expect(noteContentStore.getState().hasEdits).toBe(true);
  });

  it("calls afterSave when flush triggered by switchNote", async () => {
    const repository = createRepository("initial");
    const afterSave = vi.fn();
    noteContentStore.getState().init("10-01-2026", repository, afterSave);

    await waitForStatus("ready");

    noteContentStore.getState().setContent("draft");
    await noteContentStore.getState().switchNote("11-01-2026");

    expect(repository.save).toHaveBeenCalled();
    expect(afterSave).toHaveBeenCalledWith({
      date: "10-01-2026",
      content: "draft",
      isEmpty: false,
    });
  });

  it("does not delete a note loaded with content when content becomes empty", async () => {
    const repository = createRepository("Hello world");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");

    noteContentStore.getState().setContent("");
    expect(noteContentStore.getState().hasEdits).toBe(true);

    // Flush the save
    await noteContentStore.getState().flushSave();

    // Neither save nor delete should have been called — loadedWithContent guard
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it("does not delete a note loaded with content even on switchNote flush", async () => {
    const repository = createRepository("Hello world");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");

    noteContentStore.getState().setContent("");
    await noteContentStore.getState().switchNote("11-01-2026");

    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it("surfaces DecryptFailed error from repository.get", async () => {
    const decryptError: RepositoryError = {
      type: "DecryptFailed",
      message: "Failed to decrypt note",
    };
    const repository: NoteRepository = {
      ...syncDefaults,
      get: vi.fn().mockResolvedValue(err(decryptError)),
      save: vi.fn().mockResolvedValue(ok(undefined)),
      delete: vi.fn().mockResolvedValue(ok(undefined)),
      getAllDates: vi.fn().mockResolvedValue(ok([])),
    };

    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("error");

    expect(noteContentStore.getState().error).toEqual({
      type: "DecryptFailed",
      message: "Failed to decrypt note",
    });
    expect(noteContentStore.getState().content).toBe("");
  });

  it("sets saveError on failed save and clears on success", async () => {
    const repository = createRepository("");
    const saveError = { type: "IO" as const, message: "disk full" };
    (repository.save as Mock).mockResolvedValueOnce(err(saveError));

    noteContentStore.getState().init("10-01-2026", repository);
    await waitForStatus("ready");

    noteContentStore.getState().setContent("draft");
    await noteContentStore.getState().flushSave();

    expect(noteContentStore.getState().saveError).toEqual(saveError);

    // Successful save clears it
    (repository.save as Mock).mockResolvedValueOnce(ok(undefined));
    noteContentStore.getState().setContent("draft2");
    await noteContentStore.getState().flushSave();

    expect(noteContentStore.getState().saveError).toBeNull();
  });

  it("flushes edits on visibilitychange to hidden", async () => {
    const repository = createRepository("initial");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");

    noteContentStore.getState().setContent("draft");
    expect(noteContentStore.getState().hasEdits).toBe(true);

    // Simulate visibilitychange to hidden
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Restore visibilityState
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });

    // Wait for flush
    await new Promise((r) => setTimeout(r, 50));
    expect(repository.save).toHaveBeenCalledWith(
      "10-01-2026",
      "draft",
      null,
    );
  });

  describe("isSaving / hasEdits tracking", () => {
    it("sets hasEdits=true immediately but isSaving=false until save fires", async () => {
      const repository = createRepository("");
      noteContentStore.getState().init("10-01-2026", repository);

      await waitForStatus("ready");

      noteContentStore.getState().setContent("new content");

      expect(noteContentStore.getState().hasEdits).toBe(true);
      expect(noteContentStore.getState().isSaving).toBe(false);
    });

    it("does not set hasEdits when content matches current", async () => {
      const repository = createRepository("same content");
      noteContentStore.getState().init("10-01-2026", repository);

      await waitForStatus("ready");

      noteContentStore.getState().setContent("same content");

      expect(noteContentStore.getState().hasEdits).toBe(false);
      expect(noteContentStore.getState().isSaving).toBe(false);
    });

    it("clears hasEdits after save completes", async () => {
      const repository = createRepository("");
      noteContentStore.getState().init("10-01-2026", repository);

      await waitForStatus("ready");

      noteContentStore.getState().setContent("new content");
      expect(noteContentStore.getState().hasEdits).toBe(true);

      await noteContentStore.getState().flushSave();

      expect(noteContentStore.getState().hasEdits).toBe(false);
      expect(noteContentStore.getState().isSaving).toBe(false);
    });

    it("keeps hasEdits true if content changed during save", async () => {
      let resolveSave!: (v: { ok: true; value: undefined }) => void;
      const repository = createRepository("");
      (repository.save as Mock).mockImplementation(
        () => new Promise((r) => { resolveSave = r; }),
      );
      noteContentStore.getState().init("10-01-2026", repository);

      await waitForStatus("ready");

      noteContentStore.getState().setContent("first");

      // Start flush (save starts but doesn't resolve)
      const flushPromise = noteContentStore.getState().flushSave();

      // Edit while save is in-flight
      noteContentStore.getState().setContent("second");

      // Resolve the first save
      resolveSave({ ok: true, value: undefined });
      await flushPromise;

      // hasEdits should still be true — content changed during save
      expect(noteContentStore.getState().hasEdits).toBe(true);

      // Let subsequent save resolve so dispose doesn't hang
      (repository.save as Mock).mockResolvedValue(ok(undefined));
    });
  });

  describe("save timing", () => {
    it("saves after 500ms idle delay", async () => {
      vi.useFakeTimers();
      const repository = createRepository("");
      noteContentStore.getState().init("10-01-2026", repository);

      // Wait for load (flush microtasks)
      await vi.advanceTimersByTimeAsync(100);

      noteContentStore.getState().setContent("draft");
      expect(repository.save).not.toHaveBeenCalled();

      // Before 500ms
      vi.advanceTimersByTime(400);
      expect(repository.save).not.toHaveBeenCalled();

      // After 500ms
      await vi.advanceTimersByTimeAsync(200);
      expect(repository.save).toHaveBeenCalledWith(
        "10-01-2026",
        "draft",
        null,
      );

      vi.useRealTimers();
    });

    it("resets idle timer on continued edits", async () => {
      vi.useFakeTimers();
      const repository = createRepository("");
      noteContentStore.getState().init("10-01-2026", repository);

      await vi.advanceTimersByTimeAsync(100);

      noteContentStore.getState().setContent("draft");
      vi.advanceTimersByTime(400);
      expect(repository.save).not.toHaveBeenCalled();

      // Edit again — resets timer
      noteContentStore.getState().setContent("draft with more text");
      vi.advanceTimersByTime(400);
      expect(repository.save).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(200);
      expect(repository.save).toHaveBeenCalledWith(
        "10-01-2026",
        "draft with more text",
        null,
      );

      vi.useRealTimers();
    });
  });

  it("reloadFromLocal skips stale read when content changed during async gap", async () => {
    // Simulate the race: reloadFromLocal starts a DB read, user edits + save
    // completes during the read, stale DB data resolves — must NOT overwrite.
    let getCallCount = 0;
    const repository = createRepository("original");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");
    expect(noteContentStore.getState().content).toBe("original");

    // Mock get() to simulate a slow DB read: while it's pending, we'll
    // setContent + flush a save so the store moves on.
    let resolveSlowGet!: (v: ReturnType<typeof ok>) => void;
    (repository.get as Mock).mockImplementation(
      () =>
        new Promise((r) => {
          getCallCount++;
          // First call (the slow reloadFromLocal read) blocks
          if (getCallCount === 1) {
            resolveSlowGet = r;
          } else {
            // Subsequent calls return the latest saved content
            r(ok({ date: "10-01-2026", content: "edited", updatedAt: "" }));
          }
        }),
    );

    // Trigger reloadFromLocal — starts the slow DB read
    const reloadPromise = noteContentStore.getState().reloadFromLocal();

    // User edits and save completes while DB read is in-flight
    noteContentStore.getState().setContent("edited");
    await noteContentStore.getState().flushSave();
    expect(noteContentStore.getState().content).toBe("edited");
    expect(noteContentStore.getState().hasEdits).toBe(false);

    // Slow DB read finally resolves with STALE content
    resolveSlowGet(
      ok({ date: "10-01-2026", content: "original", updatedAt: "" }),
    );
    await reloadPromise;

    // Store must still have "edited" — the stale "original" must be rejected
    expect(noteContentStore.getState().content).toBe("edited");
  });

  it("dispose racing with init does not prevent load", async () => {
    const repository = createRepository("day one");
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");
    expect(noteContentStore.getState().content).toBe("day one");

    // Simulate what React does on dep change: fire-and-forget dispose, then init
    (repository.get as Mock).mockResolvedValue(
      ok({
        date: "11-01-2026",
        content: "day two",
        updatedAt: "2026-01-11T10:00:00.000Z",
      }),
    );

    void noteContentStore.getState().dispose();
    noteContentStore.getState().init("11-01-2026", repository);

    await waitForStatus("ready");
    expect(noteContentStore.getState().date).toBe("11-01-2026");
    expect(noteContentStore.getState().content).toBe("day two");
  });
});
