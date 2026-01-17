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
});
