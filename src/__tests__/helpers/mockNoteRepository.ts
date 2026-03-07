import { ok } from "../../domain/result";
import type {
  NoteRepository,
  SyncCapableNoteRepository,
} from "../../storage/noteRepository";

/**
 * Default no-op implementations for sync-aware NoteRepository methods.
 * Spread into partial mocks to satisfy the full interface.
 */
type SyncDefaults = Pick<
  SyncCapableNoteRepository,
  | "refreshNote"
  | "hasPendingOp"
  | "refreshDates"
  | "hasRemoteDateCached"
  | "getAllLocalDates"
  | "getAllLocalDatesForYear"
  | "sync"
> &
  Pick<NoteRepository, "getAllDatesForYear"> & { syncCapable: boolean };

export const syncDefaults: SyncDefaults = {
  syncCapable: false,
  getAllDatesForYear: vi.fn().mockResolvedValue(ok([])),
  refreshNote: vi.fn().mockResolvedValue(ok(null)),
  hasPendingOp: vi.fn().mockResolvedValue(false),
  refreshDates: vi.fn().mockResolvedValue(undefined),
  hasRemoteDateCached: vi.fn().mockResolvedValue(false),
  getAllLocalDates: vi.fn().mockResolvedValue(ok([])),
  getAllLocalDatesForYear: vi.fn().mockResolvedValue(ok([])),
  sync: vi.fn().mockResolvedValue(ok("idle")),
};
