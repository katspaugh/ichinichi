// @vitest-environment jsdom
/**
 * Race condition tests for noteContentStore.
 * Encode invariants of the generation counter / disposed flag patterns.
 */
import { noteContentStore } from "../stores/noteContentStore";
import { ok } from "../domain/result";
import type { NoteRepository } from "../storage/noteRepository";
import { syncDefaults } from "./helpers/mockNoteRepository";

let mockOnline = true;
vi.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: () => mockOnline,
    subscribe: vi.fn(() => () => {}),
  },
}));

/** Creates a repository where `get` is a controllable deferred. */
function createDeferredRepository() {
  const deferreds: Array<{
    resolve: (v: ReturnType<typeof ok>) => void;
    date: string;
  }> = [];

  const repository: NoteRepository = {
    ...syncDefaults,
    get: vi.fn().mockImplementation(
      (date: string) =>
        new Promise((resolve) => {
          deferreds.push({ resolve, date });
        }),
    ),
    save: vi.fn().mockResolvedValue(ok(undefined)),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    getAllDates: vi.fn().mockResolvedValue(ok([])),
  };

  return { repository, deferreds };
}

function createRepository(contentByDate: Record<string, string> = {}): NoteRepository {
  return {
    ...syncDefaults,
    get: vi.fn().mockImplementation((date: string) =>
      Promise.resolve(
        ok(
          contentByDate[date]
            ? {
                date,
                content: contentByDate[date],
                updatedAt: "2026-01-10T10:00:00.000Z",
              }
            : null,
        ),
      ),
    ),
    save: vi.fn().mockResolvedValue(ok(undefined)),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    getAllDates: vi.fn().mockResolvedValue(ok([])),
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

describe("noteContentStore race conditions", () => {
  beforeEach(() => {
    mockOnline = true;
  });

  afterEach(async () => {
    await noteContentStore.getState().dispose();
  });

  it("rapid switchNote: later load supersedes earlier", async () => {
    const { repository, deferreds } = createDeferredRepository();
    noteContentStore.getState().init("01-01-2026", repository);

    // First load starts (date A)
    await vi.waitFor(() => expect(deferreds).toHaveLength(1));

    // Switch to date B before A resolves
    void noteContentStore.getState().switchNote("02-01-2026");

    // Wait for second load to start
    await vi.waitFor(() => expect(deferreds).toHaveLength(2));

    // Resolve A (stale) — should be ignored
    deferreds[0].resolve(
      ok({
        date: "01-01-2026",
        content: "old content",
        updatedAt: "2026-01-01T00:00:00Z",
      }),
    );
    // Small tick to let microtasks run
    await new Promise((r) => setTimeout(r, 20));

    // Store should still be loading (B not resolved yet)
    expect(noteContentStore.getState().status).toBe("loading");
    expect(noteContentStore.getState().content).toBe("");

    // Resolve B — should be applied
    deferreds[1].resolve(
      ok({
        date: "02-01-2026",
        content: "new content",
        updatedAt: "2026-01-02T00:00:00Z",
      }),
    );
    await waitForStatus("ready");

    expect(noteContentStore.getState().content).toBe("new content");
    expect(noteContentStore.getState().date).toBe("02-01-2026");
  });

  it("setContent during refreshFromRemote preserves user edits", async () => {
    const repository = createRepository({ "01-01-2026": "initial" });
    // Make refreshNote slow
    const refreshResolvers: Array<(v: unknown) => void> = [];
    (repository as unknown as Record<string, unknown>).refreshNote = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            refreshResolvers.push(resolve);
          }),
      );
    (repository as unknown as Record<string, unknown>).syncCapable = true;

    noteContentStore.getState().init("01-01-2026", repository);
    await waitForStatus("ready");

    // User starts editing while refresh is in flight
    noteContentStore.getState().setContent("user typing");
    expect(noteContentStore.getState().hasEdits).toBe(true);

    // Remote refresh resolves with different content
    if (refreshResolvers.length > 0) {
      refreshResolvers[refreshResolvers.length - 1](
        ok({
          date: "01-01-2026",
          content: "remote update",
          updatedAt: "2026-01-10T12:00:00Z",
        }),
      );
    }
    await new Promise((r) => setTimeout(r, 50));

    // User edits must win — remote should not overwrite
    expect(noteContentStore.getState().content).toBe("user typing");
    expect(noteContentStore.getState().hasEdits).toBe(true);
  });

  it("dispose during active load: no post-dispose state update", async () => {
    const { repository, deferreds } = createDeferredRepository();
    noteContentStore.getState().init("01-01-2026", repository);

    await vi.waitFor(() => expect(deferreds).toHaveLength(1));

    // Dispose while load is in flight
    await noteContentStore.getState().dispose();
    expect(noteContentStore.getState().status).toBe("idle");

    // Now resolve the stale load
    deferreds[0].resolve(
      ok({
        date: "01-01-2026",
        content: "stale",
        updatedAt: "2026-01-01T00:00:00Z",
      }),
    );
    await new Promise((r) => setTimeout(r, 50));

    // Store must remain idle — load was superseded by dispose
    expect(noteContentStore.getState().status).toBe("idle");
    expect(noteContentStore.getState().content).toBe("");
  });

  it("double flushSave is idempotent", async () => {
    const repository = createRepository({ "01-01-2026": "initial" });
    noteContentStore.getState().init("01-01-2026", repository);
    await waitForStatus("ready");

    noteContentStore.getState().setContent("edited");

    // Flush twice concurrently
    const [r1, r2] = await Promise.all([
      noteContentStore.getState().flushSave(),
      noteContentStore.getState().flushSave(),
    ]);

    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();
    // Save should have been called exactly once
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it("reloadFromLocal after dispose is a no-op", async () => {
    const repository = createRepository({ "01-01-2026": "initial" });
    noteContentStore.getState().init("01-01-2026", repository);
    await waitForStatus("ready");

    await noteContentStore.getState().dispose();

    // Should not throw or update state
    await noteContentStore.getState().reloadFromLocal();

    expect(noteContentStore.getState().status).toBe("idle");
    expect(noteContentStore.getState().content).toBe("");
  });

  it("init during dispose: init wins", async () => {
    const repository = createRepository({ "01-01-2026": "initial" });
    let saveDone: (() => void) | null = null;
    (repository as unknown as Record<string, unknown>).save = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            saveDone = () => resolve(ok(undefined));
          }),
      );

    noteContentStore.getState().init("01-01-2026", repository);
    await waitForStatus("ready");

    noteContentStore.getState().setContent("pending save");

    // Start dispose (will wait for flushSave)
    const disposePromise = noteContentStore.getState().dispose();

    // Wait for save to start
    await vi.waitFor(() => expect(saveDone).not.toBeNull());

    // Re-init while dispose is flushing
    const repo2 = createRepository({ "02-01-2026": "second" });
    noteContentStore.getState().init("02-01-2026", repo2);

    // Finish the save
    saveDone!();
    await disposePromise;

    // Init's load should win — store should not be idle from dispose
    await waitForStatus("ready");
    expect(noteContentStore.getState().date).toBe("02-01-2026");
    expect(noteContentStore.getState().content).toBe("second");
  });
});
