import type { Note, HabitValues } from "../types";
import type { Result } from "../domain/result";
import type { RepositoryError } from "../domain/errors";

export interface NoteRepository {
  get(date: string): Promise<Result<Note | null, RepositoryError>>;
  save(date: string, content: string, habits?: HabitValues): Promise<Result<void, RepositoryError>>;
  delete(date: string): Promise<Result<void, RepositoryError>>;
  getAllDates(): Promise<Result<string[], RepositoryError>>;
}
