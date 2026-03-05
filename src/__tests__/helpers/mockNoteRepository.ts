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
  getAllDatesForYear: jest.fn().mockResolvedValue(ok([])),
  refreshNote: jest.fn().mockResolvedValue(ok(null)),
  hasPendingOp: jest.fn().mockResolvedValue(false),
  refreshDates: jest.fn().mockResolvedValue(undefined),
  hasRemoteDateCached: jest.fn().mockResolvedValue(false),
  getAllLocalDates: jest.fn().mockResolvedValue(ok([])),
  getAllLocalDatesForYear: jest.fn().mockResolvedValue(ok([])),
  sync: jest.fn().mockResolvedValue(ok("idle")),
};
