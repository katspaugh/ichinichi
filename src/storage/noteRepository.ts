import type { Note, SavedWeather } from "../types";
import type { Result } from "../domain/result";
import type { RepositoryError } from "../domain/errors";

export interface NoteRepository {
  // Core CRUD
  get(date: string): Promise<Result<Note | null, RepositoryError>>;
  save(
    date: string,
    content: string,
    weather?: SavedWeather | null,
  ): Promise<Result<void, RepositoryError>>;
  delete(date: string): Promise<Result<void, RepositoryError>>;
  getAllDates(): Promise<Result<string[], RepositoryError>>;
  getAllDatesForYear(year: number): Promise<Result<string[], RepositoryError>>;
  // Soft-delete support
  getIncludingDeleted?(date: string): Promise<Result<Note | null, RepositoryError>>;
  restoreNote?(date: string): Promise<Result<void, RepositoryError>>;
}
