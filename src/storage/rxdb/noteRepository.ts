import type { NoteRepository } from "../noteRepository";
import type { Note, SavedWeather } from "../../types";
import type { RepositoryError } from "../../domain/errors";
import type { Result } from "../../domain/result";
import type { AppDatabase } from "./database";
import { ok, err } from "../../domain/result";
import { reportError } from "../../utils/errorReporter";

export class RxDBNoteRepository implements NoteRepository {
  constructor(private readonly db: AppDatabase) {}

  async get(date: string): Promise<Result<Note | null, RepositoryError>> {
    try {
      const doc = await this.db.notes.findOne(date).exec();
      if (!doc || doc.isDeleted) return ok(null);
      return ok(this.toNote(doc));
    } catch (error) {
      reportError("rxNoteRepository.get", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async save(
    date: string,
    content: string,
    weather?: SavedWeather | null,
  ): Promise<Result<void, RepositoryError>> {
    try {
      await this.db.notes.upsert({
        date,
        content,
        updatedAt: new Date().toISOString(),
        isDeleted: false,
        weather: weather ?? null,
      });
      return ok(undefined);
    } catch (error) {
      reportError("rxNoteRepository.save", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async delete(date: string): Promise<Result<void, RepositoryError>> {
    try {
      const doc = await this.db.notes.findOne(date).exec();
      if (!doc) return ok(undefined);
      await doc.patch({ isDeleted: true });
      return ok(undefined);
    } catch (error) {
      reportError("rxNoteRepository.delete", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async getAllDates(): Promise<Result<string[], RepositoryError>> {
    try {
      const docs = await this.db.notes
        .find({ selector: { isDeleted: { $eq: false } } })
        .exec();
      return ok(docs.map((d) => d.date));
    } catch (error) {
      reportError("rxNoteRepository.getAllDates", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async getAllDatesForYear(year: number): Promise<Result<string[], RepositoryError>> {
    try {
      const docs = await this.db.notes
        .find({ selector: { isDeleted: { $eq: false } } })
        .exec();
      const yearSuffix = `-${year}`;
      const dates = docs
        .map((d) => d.date)
        .filter((date) => date.endsWith(yearSuffix));
      return ok(dates);
    } catch (error) {
      reportError("rxNoteRepository.getAllDatesForYear", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async getIncludingDeleted(date: string): Promise<Result<Note | null, RepositoryError>> {
    try {
      const doc = await this.db.notes.findOne(date).exec();
      if (!doc) return ok(null);
      return ok(this.toNote(doc));
    } catch (error) {
      reportError("rxNoteRepository.getIncludingDeleted", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async restoreNote(date: string): Promise<Result<void, RepositoryError>> {
    try {
      const doc = await this.db.notes.findOne(date).exec();
      if (!doc) return ok(undefined);
      await doc.patch({ isDeleted: false });
      return ok(undefined);
    } catch (error) {
      reportError("rxNoteRepository.restoreNote", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  private toNote(doc: { date: string; content: string; updatedAt: string; weather?: SavedWeather | null }): Note {
    return {
      date: doc.date,
      content: doc.content,
      updatedAt: doc.updatedAt,
      weather: doc.weather ?? undefined,
    };
  }
}
