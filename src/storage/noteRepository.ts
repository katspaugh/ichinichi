import type { Note } from "../types";
import type { Result } from "../domain/result";
import type { RepositoryError } from "../domain/errors";
import type { Syncable } from "../domain/sync";

export interface NoteRepository {
  // Core CRUD
  get(date: string): Promise<Result<Note | null, RepositoryError>>;
  save(date: string, content: string): Promise<Result<void, RepositoryError>>;
  delete(date: string): Promise<Result<void, RepositoryError>>;
  getAllDates(): Promise<Result<string[], RepositoryError>>;
  getAllDatesForYear(year: number): Promise<Result<string[], RepositoryError>>;
}

export interface SyncCapableNoteRepository
  extends NoteRepository,
    Syncable {
  readonly syncCapable: true;
  refreshNote(date: string): Promise<Result<Note | null, RepositoryError>>;
  hasPendingOp(date: string): Promise<boolean>;
  refreshDates(year: number): Promise<void>;
  hasRemoteDateCached(date: string): Promise<boolean>;
  getAllLocalDates(): Promise<Result<string[], RepositoryError>>;
  getAllLocalDatesForYear(year: number): Promise<Result<string[], RepositoryError>>;
}

export function isSyncCapableNoteRepository(
  repository: NoteRepository | null | undefined,
): repository is SyncCapableNoteRepository {
  return (
    repository !== null &&
    repository !== undefined &&
    "syncCapable" in repository &&
    repository.syncCapable === true
  );
}
