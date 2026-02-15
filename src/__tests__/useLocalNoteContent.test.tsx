import { act, renderHook, waitFor } from "@testing-library/react";
import { useLocalNoteContent } from "../hooks/useLocalNoteContent";
import { ok } from "../domain/result";
import type { NoteRepository } from "../storage/noteRepository";

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

describe("useLocalNoteContent", () => {
  it("flushes pending edits when date changes", async () => {
    const repository = createRepository("initial");
    const { result, rerender } = renderHook(
      ({ date }) => useLocalNoteContent(date, repository),
      {
        initialProps: { date: "10-01-2026" },
      },
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.setContent("draft");
    });

    expect(result.current.hasEdits).toBe(true);

    rerender({ date: "11-01-2026" });

    await waitFor(() =>
      expect(repository.save).toHaveBeenCalledWith("10-01-2026", "draft"),
    );
  });

  it("ignores remote updates while edits exist", async () => {
    const repository = createRepository("initial");
    const { result } = renderHook(() =>
      useLocalNoteContent("10-01-2026", repository),
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.setContent("draft");
    });

    act(() => {
      result.current.applyRemoteUpdate("remote");
    });

    expect(result.current.content).toBe("draft");
    expect(result.current.hasEdits).toBe(true);
  });

  it("flushes edits when date changes and calls afterSave", async () => {
    const repository = createRepository("initial");
    const afterSave = jest.fn();
    const { result, rerender } = renderHook(
      ({ date }) => useLocalNoteContent(date, repository, afterSave),
      { initialProps: { date: "10-01-2026" } },
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.setContent("draft");
    });

    act(() => {
      rerender({ date: "11-01-2026" });
    });

    await waitFor(() => expect(repository.save).toHaveBeenCalled());
    await waitFor(() =>
      expect(afterSave).toHaveBeenCalledWith({
        date: "10-01-2026",
        content: "draft",
        isEmpty: false,
      }),
    );
  });

  it("flushPendingSave calls afterSave captured at invocation time, not resolution time", async () => {
    const repository = createRepository("initial");
    // Make save slow so we can swap afterSave before it resolves
    let resolveSave!: (v: { ok: true; value: undefined }) => void;
    (repository.save as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const afterSave1 = jest.fn();
    const afterSave2 = jest.fn();
    const { result, rerender } = renderHook(
      ({ date, afterSave }) =>
        useLocalNoteContent(date, repository, afterSave),
      { initialProps: { date: "10-01-2026", afterSave: afterSave1 } },
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.setContent("draft");
    });

    // Change date to trigger flushPendingSave (captures afterSave1)
    act(() => {
      rerender({ date: "11-01-2026", afterSave: afterSave1 });
    });

    // While save is in-flight, swap the afterSave callback
    act(() => {
      rerender({ date: "11-01-2026", afterSave: afterSave2 });
    });

    // Now resolve the save
    await act(async () => {
      resolveSave({ ok: true, value: undefined });
      await Promise.resolve();
    });

    // afterSave1 should have been called (it was active when flush was triggered)
    // afterSave2 should NOT have been called (it was set after the flush)
    expect(afterSave1).toHaveBeenCalledWith({
      date: "10-01-2026",
      content: "draft",
      isEmpty: false,
    });
    expect(afterSave2).not.toHaveBeenCalled();
  });

  it("does not delete a note via flush when loaded with content and content becomes empty", async () => {
    const repository = createRepository("Hello world");
    const { result, rerender } = renderHook(
      ({ date }) => useLocalNoteContent(date, repository),
      { initialProps: { date: "10-01-2026" } },
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));

    // Content becomes empty
    act(() => {
      result.current.setContent("");
    });

    // Navigate away to trigger flushPendingSave
    rerender({ date: "11-01-2026" });

    // Wait for any async operations
    await waitFor(() => expect(repository.save).not.toHaveBeenCalled());

    // delete must NOT be called — the note was loaded with content
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it("does not delete a note that was loaded with content even if content becomes empty", async () => {
    const repository = createRepository("Hello world");
    const { result } = renderHook(() =>
      useLocalNoteContent("10-01-2026", repository),
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.content).toBe("Hello world");

    // Simulate content becoming empty (e.g., due to DOM reset race condition)
    act(() => {
      result.current.setContent("");
    });

    expect(result.current.hasEdits).toBe(true);

    // Wait for save timer (2s) to fire
    await act(async () => {
      jest.advanceTimersByTime?.(2500) ??
        (await new Promise((r) => setTimeout(r, 2500)));
    });

    // repository.delete should NOT have been called — the note previously had content,
    // so deleting it would risk data loss
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it("flushes edits on visibilitychange to hidden", async () => {
    const repository = createRepository("initial");
    const { result } = renderHook(() =>
      useLocalNoteContent("10-01-2026", repository),
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.setContent("draft");
    });

    expect(result.current.hasEdits).toBe(true);

    // Simulate visibilitychange to hidden
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Restore visibilityState
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });

    await waitFor(() =>
      expect(repository.save).toHaveBeenCalledWith("10-01-2026", "draft"),
    );
  });
});
