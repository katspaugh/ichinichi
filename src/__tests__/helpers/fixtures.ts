import type { Note, SyncedNote } from "../../types";

/**
 * Create a Note with sensible defaults.
 * Override any field by passing partial overrides.
 */
export function noteFixture(overrides: Partial<Note> = {}): Note {
  return {
    date: "10-01-2026",
    content: "<p>Test note</p>",
    updatedAt: "2026-01-10T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * Create a SyncedNote with sensible defaults.
 */
export function syncedNoteFixture(
  overrides: Partial<SyncedNote> = {},
): SyncedNote {
  return {
    date: "10-01-2026",
    content: "<p>Test note</p>",
    updatedAt: "2026-01-10T10:00:00.000Z",
    revision: 1,
    ...overrides,
  };
}
