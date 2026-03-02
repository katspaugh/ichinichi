/* eslint-disable @typescript-eslint/no-explicit-any */
import { noteContentStore } from "../stores/noteContentStore";
import { ok, err } from "../domain/result";
import type { NoteRepository } from "../storage/noteRepository";
import type { RepositoryError } from "../domain/errors";

// Mock connectivity as online by default
let mockOnline = true;
jest.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: () => mockOnline,
    subscribe: jest.fn(() => () => {}),
  },
}));

function createRepository(initialContent = ""): NoteRepository {
  return {
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
  };
}

function createRepositoryWithHabitInheritance(): NoteRepository {
  const habits = {
    h1: { name: "Exercise", type: "text" as const, order: 0, value: "done" },
  };
  return {
    get: jest.fn((date: string) => {
      if (date === "09-01-2026") {
        return Promise.resolve(
          ok({
            date: "09-01-2026",
            content: "note with habits",
            habits,
            updatedAt: "2026-01-09T10:00:00.000Z",
          }),
        );
      }
      return Promise.resolve(ok(null));
    }),
    save: jest.fn().mockResolvedValue(ok(undefined)),
    delete: jest.fn().mockResolvedValue(ok(undefined)),
    getAllDates: jest.fn().mockResolvedValue(ok(["09-01-2026"])),
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
      undefined,
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
    const afterSave = jest.fn();
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

  it("inherits habit definitions from most recent previous note when note does not exist", async () => {
    const repository = createRepositoryWithHabitInheritance();
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");

    expect(noteContentStore.getState().content).toBe("");
    expect(noteContentStore.getState().habits).toEqual({
      h1: { name: "Exercise", type: "text", order: 0, value: "" },
    });
  });

  it("inherits habit definitions when note exists but has no habits", async () => {
    const habits = {
      h1: {
        name: "Exercise",
        type: "text" as const,
        order: 0,
        value: "done",
      },
    };
    const repository: NoteRepository = {
      get: jest.fn((date: string) => {
        if (date === "09-01-2026") {
          return Promise.resolve(
            ok({
              date: "09-01-2026",
              content: "note with habits",
              habits,
              updatedAt: "2026-01-09T10:00:00.000Z",
            }),
          );
        }
        return Promise.resolve(
          ok({
            date: "10-01-2026",
            content: "some content",
            updatedAt: "2026-01-10T10:00:00.000Z",
          }),
        );
      }),
      save: jest.fn().mockResolvedValue(ok(undefined)),
      delete: jest.fn().mockResolvedValue(ok(undefined)),
      getAllDates: jest
        .fn()
        .mockResolvedValue(ok(["09-01-2026", "10-01-2026"])),
    };
    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("ready");

    expect(noteContentStore.getState().content).toBe("some content");
    expect(noteContentStore.getState().habits).toEqual({
      h1: { name: "Exercise", type: "text", order: 0, value: "" },
    });
  });

  it("surfaces DecryptFailed error from repository.get", async () => {
    const decryptError: RepositoryError = {
      type: "DecryptFailed",
      message: "Failed to decrypt note",
    };
    const repository: NoteRepository = {
      get: jest.fn().mockResolvedValue(err(decryptError)),
      save: jest.fn().mockResolvedValue(ok(undefined)),
      delete: jest.fn().mockResolvedValue(ok(undefined)),
      getAllDates: jest.fn().mockResolvedValue(ok([])),
    };

    noteContentStore.getState().init("10-01-2026", repository);

    await waitForStatus("error");

    expect(noteContentStore.getState().error).toBeInstanceOf(Error);
    expect(noteContentStore.getState().error!.message).toBe(
      "Failed to decrypt note",
    );
    expect(noteContentStore.getState().content).toBe("");
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
      undefined,
    );
  });

  describe("isSaving / hasEdits tracking", () => {
    it("sets isSaving=true and hasEdits=true when content is edited", async () => {
      const repository = createRepository("");
      noteContentStore.getState().init("10-01-2026", repository);

      await waitForStatus("ready");

      noteContentStore.getState().setContent("new content");

      expect(noteContentStore.getState().hasEdits).toBe(true);
      expect(noteContentStore.getState().isSaving).toBe(true);
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
      (repository.save as jest.Mock).mockImplementation(
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
      (repository.save as jest.Mock).mockResolvedValue(ok(undefined));
    });
  });

  describe("save timing", () => {
    it("saves after 2s idle delay", async () => {
      jest.useFakeTimers();
      const repository = createRepository("");
      noteContentStore.getState().init("10-01-2026", repository);

      // Wait for load (flush microtasks)
      await jest.advanceTimersByTimeAsync(100);

      noteContentStore.getState().setContent("draft");
      expect(repository.save).not.toHaveBeenCalled();

      // Before 2s
      jest.advanceTimersByTime(1900);
      expect(repository.save).not.toHaveBeenCalled();

      // After 2s
      await jest.advanceTimersByTimeAsync(200);
      expect(repository.save).toHaveBeenCalledWith(
        "10-01-2026",
        "draft",
        undefined,
      );

      jest.useRealTimers();
    });

    it("resets idle timer on continued edits", async () => {
      jest.useFakeTimers();
      const repository = createRepository("");
      noteContentStore.getState().init("10-01-2026", repository);

      await jest.advanceTimersByTimeAsync(100);

      noteContentStore.getState().setContent("draft");
      jest.advanceTimersByTime(1900);
      expect(repository.save).not.toHaveBeenCalled();

      // Edit again — resets timer
      noteContentStore.getState().setContent("draft with more text");
      jest.advanceTimersByTime(1900);
      expect(repository.save).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(200);
      expect(repository.save).toHaveBeenCalledWith(
        "10-01-2026",
        "draft with more text",
        undefined,
      );

      jest.useRealTimers();
    });
  });
});
