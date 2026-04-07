import { ok } from "../../domain/result";
import type { NoteRepository } from "../../storage/noteRepository";

/**
 * Default no-op implementations for NoteRepository methods.
 * Spread into partial mocks to satisfy the full interface.
 */
type RepoDefaults = Pick<NoteRepository, "getAllDatesForYear">;

export const syncDefaults: RepoDefaults = {
  getAllDatesForYear: vi.fn().mockResolvedValue(ok([])),
};
