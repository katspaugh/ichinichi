// @vitest-environment jsdom
/**
 * Race condition tests for noteDatesStore.
 * Encode invariants of the generation counter / disposed flag patterns.
 */
import { createNoteDatesStore } from "../stores/noteDatesStore";
import { ok } from "../domain/result";
import type { NoteRepository } from "../storage/noteRepository";
import { syncDefaults } from "./helpers/mockNoteRepository";

vi.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: () => true,
    subscribe: vi.fn(() => () => {}),
  },
}));

function createDeferredRepository() {
  const deferreds: Array<{
    resolve: (v: ReturnType<typeof ok>) => void;
    year?: number;
  }> = [];

  const repository: NoteRepository = {
    ...syncDefaults,
    get: vi.fn().mockResolvedValue(ok(null)),
    save: vi.fn().mockResolvedValue(ok(undefined)),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    getAllDates: vi.fn().mockResolvedValue(ok([])),
    getAllDatesForYear: vi.fn().mockImplementation(
      (year: number) =>
        new Promise((resolve) => {
          deferreds.push({ resolve, year });
        }),
    ),
  };

  return { repository, deferreds };
}

describe("noteDatesStore race conditions", () => {
  it("setYear during refresh: later year supersedes earlier", async () => {
    const { repository, deferreds } = createDeferredRepository();
    const store = createNoteDatesStore({
      connectivity: { getOnline: () => false },
    });
    store.getState().init(repository, 2025);

    // Wait for first refresh to start
    await vi.waitFor(() => expect(deferreds).toHaveLength(1));
    expect(deferreds[0].year).toBe(2025);

    // Switch year before 2025 resolves
    store.getState().setYear(2026);

    await vi.waitFor(() => expect(deferreds).toHaveLength(2));
    expect(deferreds[1].year).toBe(2026);

    // Resolve 2025 (stale) — should be ignored
    deferreds[0].resolve(ok(["01-01-2025", "02-01-2025"]));
    await new Promise((r) => setTimeout(r, 20));

    // Store should still be refreshing (2026 not resolved)
    expect(store.getState().isRefreshing).toBe(true);
    expect(store.getState().noteDates.size).toBe(0);

    // Resolve 2026 — should be applied
    deferreds[1].resolve(ok(["01-01-2026"]));
    await vi.waitFor(() => !store.getState().isRefreshing);

    expect(store.getState().noteDates).toEqual(new Set(["01-01-2026"]));
    expect(store.getState().year).toBe(2026);

    store.getState().dispose();
  });

  it("dispose during refresh: no post-dispose update", async () => {
    const { repository, deferreds } = createDeferredRepository();
    const store = createNoteDatesStore({
      connectivity: { getOnline: () => false },
    });
    store.getState().init(repository, 2025);

    await vi.waitFor(() => expect(deferreds).toHaveLength(1));

    // Dispose while refresh is in flight
    store.getState().dispose();
    expect(store.getState()._disposed).toBe(true);

    // Resolve stale refresh
    deferreds[0].resolve(ok(["01-01-2025", "02-01-2025"]));
    await new Promise((r) => setTimeout(r, 20));

    // Store should remain disposed with empty dates (or preserved from before)
    expect(store.getState()._disposed).toBe(true);
    expect(store.getState().isRefreshing).toBe(false);
  });

  it("rapid setYear: only final year's data is applied", async () => {
    const { repository, deferreds } = createDeferredRepository();
    const store = createNoteDatesStore({
      connectivity: { getOnline: () => false },
    });
    store.getState().init(repository, 2024);

    await vi.waitFor(() => expect(deferreds).toHaveLength(1));

    // Rapid year switches
    store.getState().setYear(2025);
    store.getState().setYear(2026);

    // Wait for all refreshes to start
    await vi.waitFor(() => expect(deferreds.length).toBeGreaterThanOrEqual(3));

    // Resolve all out of order
    deferreds[1].resolve(ok(["01-01-2025"]));
    deferreds[0].resolve(ok(["01-01-2024"]));
    await new Promise((r) => setTimeout(r, 20));

    // Only 2026 (latest) should matter — store should still be refreshing
    expect(store.getState().isRefreshing).toBe(true);

    // Resolve 2026
    const lastIdx = deferreds.length - 1;
    deferreds[lastIdx].resolve(ok(["01-01-2026"]));
    await vi.waitFor(() => !store.getState().isRefreshing);

    expect(store.getState().noteDates).toEqual(new Set(["01-01-2026"]));

    store.getState().dispose();
  });
});
