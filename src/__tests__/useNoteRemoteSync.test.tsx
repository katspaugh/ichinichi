import { act, renderHook, waitFor } from "@testing-library/react";
import { useNoteRemoteSync } from "../hooks/useNoteRemoteSync";
import type { NoteRepository } from "../storage/noteRepository";

let mockOnline = true;
const getMockOnline = () => mockOnline;

jest.mock("../hooks/useConnectivity", () => ({
  useConnectivity: () => getMockOnline(),
}));

interface RefreshableRepository extends NoteRepository {
  refreshNote: (
    date: string,
  ) => Promise<{ date: string; content: string | null } | null>;
  hasRemoteDateCached: (date: string) => Promise<boolean>;
  hasPendingOp: (date: string) => Promise<boolean>;
}

function createRepository(): RefreshableRepository {
  return {
    get: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    getAllDates: jest.fn(),
    refreshNote: jest.fn().mockResolvedValue({
      date: "10-01-2026",
      content: "remote-content",
    }),
    hasRemoteDateCached: jest.fn().mockResolvedValue(true),
    hasPendingOp: jest.fn().mockResolvedValue(false),
  };
}

describe("useNoteRemoteSync", () => {
  beforeEach(() => {
    mockOnline = true;
  });

  it("applies remote refresh using latest refs", async () => {
    const repository = createRepository();
    const onRemoteUpdate = jest.fn();

    const { result, rerender } = renderHook(
      ({ date, localContent }) =>
        useNoteRemoteSync(date, repository, {
          onRemoteUpdate,
          localContent,
          hasLocalEdits: false,
          isLocalReady: true,
        }),
      {
        initialProps: { date: "10-01-2026", localContent: "local" },
      },
    );

    await waitFor(() =>
      expect(repository.refreshNote).toHaveBeenCalledWith("10-01-2026"),
    );

    rerender({ date: "11-01-2026", localContent: "local-2" });

    act(() => {
      result.current.triggerRefresh();
    });

    await waitFor(() =>
      expect(repository.refreshNote).toHaveBeenCalledWith("11-01-2026"),
    );
    await waitFor(() => expect(onRemoteUpdate).toHaveBeenCalled());
  });

  it("exposes known remote-only notes when offline", async () => {
    mockOnline = false;
    const repository = createRepository();

    const { result } = renderHook(() =>
      useNoteRemoteSync("10-01-2026", repository, {
        onRemoteUpdate: jest.fn(),
        localContent: "",
        hasLocalEdits: false,
        isLocalReady: true,
      }),
    );

    await waitFor(() => expect(result.current.isKnownRemoteOnly).toBe(true));
  });

  it("refreshes remote notes even when local content is empty", async () => {
    const repository = createRepository();
    const onRemoteUpdate = jest.fn();

    renderHook(() =>
      useNoteRemoteSync("10-01-2026", repository, {
        onRemoteUpdate,
        localContent: "",
        hasLocalEdits: false,
        isLocalReady: true,
      }),
    );

    await waitFor(() =>
      expect(repository.refreshNote).toHaveBeenCalledWith("10-01-2026"),
    );
    await waitFor(() => expect(onRemoteUpdate).toHaveBeenCalled());
  });
});
