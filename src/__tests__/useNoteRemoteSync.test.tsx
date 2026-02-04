import { act, renderHook, waitFor } from "@testing-library/react";
import { useNoteRemoteSync } from "../hooks/useNoteRemoteSync";
import type { NoteRepository } from "../storage/noteRepository";
import { ok } from "../domain/result";

let mockOnline = true;
const getMockOnline = () => mockOnline;

jest.mock("../hooks/useConnectivity", () => ({
  useConnectivity: () => getMockOnline(),
}));

interface RefreshableRepository extends NoteRepository {
  refreshNote: (
    date: string,
  ) => Promise<
    | { ok: true; value: { date: string; content: string | null } | null }
    | { ok: false; error: Error }
    | { date: string; content: string | null }
    | null
  >;
  hasRemoteDateCached: (date: string) => Promise<boolean>;
  hasPendingOp: (date: string) => Promise<boolean>;
}

function createRepository(): RefreshableRepository {
  return {
    get: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    getAllDates: jest.fn(),
    refreshNote: jest.fn().mockResolvedValue(
      ok({
        date: "10-01-2026",
        content: "remote-content",
      }),
    ),
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

  it("retries refresh when repository instance changes", async () => {
    const repository = createRepository();
    const nextRepository = createRepository();
    const onRemoteUpdate = jest.fn();

    const { rerender } = renderHook(
      ({ repo }) =>
        useNoteRemoteSync("10-01-2026", repo, {
          onRemoteUpdate,
          localContent: "local",
          hasLocalEdits: false,
          isLocalReady: true,
        }),
      {
        initialProps: { repo: repository },
      },
    );

    await waitFor(() =>
      expect(repository.refreshNote).toHaveBeenCalledWith("10-01-2026"),
    );

    rerender({ repo: nextRepository });

    await waitFor(() =>
      expect(nextRepository.refreshNote).toHaveBeenCalledWith("10-01-2026"),
    );
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

  it("forceRefresh triggers refresh even after initial refresh completed", async () => {
    const repository = createRepository();
    const onRemoteUpdate = jest.fn();

    const { result } = renderHook(() =>
      useNoteRemoteSync("10-01-2026", repository, {
        onRemoteUpdate,
        localContent: "local",
        hasLocalEdits: false,
        isLocalReady: true,
      }),
    );

    // Wait for initial refresh
    await waitFor(() =>
      expect(repository.refreshNote).toHaveBeenCalledWith("10-01-2026"),
    );

    // Clear mock to track new calls
    (repository.refreshNote as jest.Mock).mockClear();
    onRemoteUpdate.mockClear();

    // Force refresh should trigger another refresh even though we already refreshed
    act(() => {
      result.current.forceRefresh();
    });

    await waitFor(() =>
      expect(repository.refreshNote).toHaveBeenCalledWith("10-01-2026"),
    );
    await waitFor(() => expect(onRemoteUpdate).toHaveBeenCalled());
  });

  it("forceRefresh does not refresh when user has local edits", async () => {
    const repository = createRepository();
    const onRemoteUpdate = jest.fn();

    const { result, rerender } = renderHook(
      ({ hasLocalEdits }) =>
        useNoteRemoteSync("10-01-2026", repository, {
          onRemoteUpdate,
          localContent: "local",
          hasLocalEdits,
          isLocalReady: true,
        }),
      { initialProps: { hasLocalEdits: false } },
    );

    // Wait for initial refresh
    await waitFor(() =>
      expect(repository.refreshNote).toHaveBeenCalledWith("10-01-2026"),
    );

    // Rerender with local edits
    rerender({ hasLocalEdits: true });

    // Clear mock to track new calls
    (repository.refreshNote as jest.Mock).mockClear();
    onRemoteUpdate.mockClear();

    // Force refresh - should trigger refresh but not apply update due to edits
    act(() => {
      result.current.forceRefresh();
    });

    await waitFor(() =>
      expect(repository.refreshNote).toHaveBeenCalledWith("10-01-2026"),
    );

    // onRemoteUpdate should NOT be called because hasLocalEdits is true
    // Give it some time to potentially be called incorrectly
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onRemoteUpdate).not.toHaveBeenCalled();
  });
});
