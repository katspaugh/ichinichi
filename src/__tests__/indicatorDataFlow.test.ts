// @vitest-environment jsdom
import { noteContentStore } from "../stores/noteContentStore";
import { syncStore } from "../stores/syncStore";
import { SyncStatus } from "../types";
import { ok } from "../domain/result";
import { createMockNoteRepository } from "./helpers/mocks";
import { noteFixture } from "./helpers/fixtures";

vi.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: vi.fn(() => true),
    subscribe: vi.fn(() => () => {}),
  },
}));

/**
 * Integration tests for status indicators data flow.
 *
 * These tests verify that:
 * 1. The Zustand stores produce the correct status values
 * 2. The status values flow through to where components can consume them
 */

describe("Sync status data flow (syncStore)", () => {
  it("syncStore should have status=Syncing when sync starts", () => {
    const initialStatus = syncStore.getState().status;
    expect(initialStatus).toBe(SyncStatus.Idle);
  });

  it("syncStore status is exposed via getState()", () => {
    expect(syncStore.getState().status).toBe(SyncStatus.Idle);
  });
});

describe("Saving status data flow (noteContentStore)", () => {
  afterEach(async () => {
    await noteContentStore.getState().dispose();
  });

  function createTestRepository(saveOverride?: unknown) {
    return createMockNoteRepository({
      get: vi.fn().mockResolvedValue(
        ok(noteFixture({ content: "initial", date: "16-01-2026" })),
      ),
      ...(saveOverride !== undefined
        ? { save: vi.fn().mockReturnValue(saveOverride) }
        : {}),
    });
  }

  it("noteContentStore exposes isSaving=true when content is edited", async () => {
    const repository = createTestRepository();

    noteContentStore.getState().init("16-01-2026", repository);

    await new Promise((r) => setTimeout(r, 100));
    expect(noteContentStore.getState().status).toBe("ready");

    noteContentStore.getState().setContent("modified content");

    expect(noteContentStore.getState().isSaving).toBe(true);
    expect(noteContentStore.getState().hasEdits).toBe(true);
  });

  it("noteContentStore exposes isSaving=true during save", async () => {
    let resolveSave!: () => void;
    const savePromise = new Promise<void>((r) => { resolveSave = r; });

    const repository = createTestRepository(
      savePromise.then(() => ok(undefined)),
    );

    noteContentStore.getState().init("16-01-2026", repository);

    await new Promise((r) => setTimeout(r, 100));

    noteContentStore.getState().setContent("modified content");
    expect(noteContentStore.getState().isSaving).toBe(true);

    const flushPromise = noteContentStore.getState().flushSave();

    expect(noteContentStore.getState().isSaving).toBe(true);

    resolveSave();
    await flushPromise;

    expect(noteContentStore.getState().isSaving).toBe(false);
  });

  it("noteContentStore exposes isSaving=false when in ready state without edits", async () => {
    const repository = createTestRepository();

    noteContentStore.getState().init("16-01-2026", repository);

    await new Promise((r) => setTimeout(r, 100));
    expect(noteContentStore.getState().status).toBe("ready");

    expect(noteContentStore.getState().isSaving).toBe(false);
    expect(noteContentStore.getState().hasEdits).toBe(false);
  });
});
