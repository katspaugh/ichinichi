import type { Note, HabitValues, SyncStatus } from "../types";
import type { Result } from "../domain/result";
import type { RepositoryError, SyncError } from "../domain/errors";

export interface NoteRepository {
  // Core CRUD
  get(date: string): Promise<Result<Note | null, RepositoryError>>;
  save(date: string, content: string, habits?: HabitValues): Promise<Result<void, RepositoryError>>;
  delete(date: string): Promise<Result<void, RepositoryError>>;
  getAllDates(): Promise<Result<string[], RepositoryError>>;
  getAllDatesForYear(year: number): Promise<Result<string[], RepositoryError>>;

  // Sync-aware (no-ops in local-only)
  readonly syncCapable: boolean;
  refreshNote(date: string): Promise<Result<Note | null, RepositoryError>>;
  hasPendingOp(date: string): Promise<boolean>;
  refreshDates(year: number): Promise<void>;
  hasRemoteDateCached(date: string): Promise<boolean>;
  getAllLocalDates(): Promise<Result<string[], RepositoryError>>;
  getAllLocalDatesForYear(year: number): Promise<Result<string[], RepositoryError>>;
  sync(): Promise<Result<SyncStatus, SyncError>>;
}
