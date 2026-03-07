import { ok } from "../../domain/result";
import type { NoteRepository, SyncCapableNoteRepository } from "../../storage/noteRepository";

type MockedRepository<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : T[K];
};

/**
 * Create a fully mocked NoteRepository with sensible defaults.
 * All methods are vi.fn() with default resolved values.
 */
export function createMockNoteRepository(
  overrides: Partial<MockedRepository<NoteRepository>> = {},
): MockedRepository<NoteRepository> {
  return {
    get: vi.fn().mockResolvedValue(ok(null)),
    save: vi.fn().mockResolvedValue(ok(undefined)),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    getAllDates: vi.fn().mockResolvedValue(ok([])),
    getAllDatesForYear: vi.fn().mockResolvedValue(ok([])),
    ...overrides,
  };
}

/**
 * Create a fully mocked SyncCapableNoteRepository.
 * Extends NoteRepository with sync-specific methods.
 */
export function createMockSyncCapableRepository(
  overrides: Partial<MockedRepository<SyncCapableNoteRepository>> = {},
): MockedRepository<SyncCapableNoteRepository> {
  return {
    syncCapable: true as const,
    get: vi.fn().mockResolvedValue(ok(null)),
    save: vi.fn().mockResolvedValue(ok(undefined)),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    getAllDates: vi.fn().mockResolvedValue(ok([])),
    getAllDatesForYear: vi.fn().mockResolvedValue(ok([])),
    refreshNote: vi.fn().mockResolvedValue(ok(null)),
    hasPendingOp: vi.fn().mockResolvedValue(false),
    refreshDates: vi.fn().mockResolvedValue(undefined),
    hasRemoteDateCached: vi.fn().mockResolvedValue(false),
    getAllLocalDates: vi.fn().mockResolvedValue(ok([])),
    getAllLocalDatesForYear: vi.fn().mockResolvedValue(ok([])),
    sync: vi.fn().mockResolvedValue(ok("idle")),
    ...overrides,
  };
}

/**
 * Create a mock connectivity service.
 * Returns the mock and a toggle function to change online state.
 */
export function createMockConnectivity(online = true) {
  let isOnline = online;
  return {
    connectivity: {
      getOnline: () => isOnline,
      subscribe: vi.fn(() => () => {}),
    },
    setOnline(value: boolean) {
      isOnline = value;
    },
  };
}
