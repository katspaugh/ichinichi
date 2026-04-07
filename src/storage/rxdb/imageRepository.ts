import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageRepository } from "../imageRepository";
import type { NoteImage } from "../../types";
import type { RepositoryError } from "../../domain/errors";
import type { Result } from "../../domain/result";
import type { AppDatabase } from "./database";
import { ok, err } from "../../domain/result";
import { reportError } from "../../utils/errorReporter";

export class RxDBImageRepository implements ImageRepository {
  readonly db: AppDatabase;
  private readonly supabase: SupabaseClient | null;
  private readonly userId: string | null;

  constructor(db: AppDatabase, supabase?: SupabaseClient | null, userId?: string | null) {
    this.db = db;
    this.supabase = supabase ?? null;
    this.userId = userId ?? null;
  }

  async upload(
    noteDate: string,
    file: Blob,
    type: "background" | "inline",
    filename: string,
    options?: { width?: number; height?: number },
  ): Promise<Result<NoteImage, RepositoryError>> {
    try {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      const doc = await this.db.images.insert({
        id,
        noteDate,
        type,
        filename,
        mimeType: file.type || "application/octet-stream",
        width: options?.width ?? 0,
        height: options?.height ?? 0,
        size: file.size,
        createdAt,
        isDeleted: false,
      });

      await doc.putAttachment({
        id: "blob",
        data: file,
        type: file.type || "application/octet-stream",
      });

      return ok({
        id,
        noteDate,
        type,
        filename,
        mimeType: file.type || "application/octet-stream",
        width: options?.width ?? 0,
        height: options?.height ?? 0,
        size: file.size,
        createdAt,
      });
    } catch (error) {
      reportError("rxImageRepository.upload", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async get(imageId: string): Promise<Result<Blob | null, RepositoryError>> {
    try {
      const doc = await this.db.images.findOne(imageId).exec();
      if (!doc || doc.isDeleted) return ok(null);

      const attachment = doc.getAttachment("blob");
      if (!attachment) return ok(null);

      const data = await attachment.getData();
      return ok(data);
    } catch (error) {
      reportError("rxImageRepository.get", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async getUrl(imageId: string): Promise<Result<string | null, RepositoryError>> {
    if (!this.supabase || !this.userId) {
      return ok(null);
    }
    try {
      const path = `${this.userId}/${imageId}`;
      const { data, error } = await this.supabase.storage
        .from("note-images")
        .createSignedUrl(path, 3600);
      if (error) {
        reportError("rxImageRepository.getUrl", error);
        return ok(null);
      }
      return ok(data.signedUrl);
    } catch (error) {
      reportError("rxImageRepository.getUrl", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async delete(imageId: string): Promise<Result<void, RepositoryError>> {
    try {
      const doc = await this.db.images.findOne(imageId).exec();
      if (!doc) return ok(undefined);
      await doc.patch({ isDeleted: true });
      return ok(undefined);
    } catch (error) {
      reportError("rxImageRepository.delete", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async getByNoteDate(noteDate: string): Promise<Result<NoteImage[], RepositoryError>> {
    try {
      const docs = await this.db.images
        .find({ selector: { noteDate: { $eq: noteDate }, isDeleted: { $eq: false } } })
        .exec();

      const images: NoteImage[] = docs.map((doc) => ({
        id: doc.id,
        noteDate: doc.noteDate,
        type: doc.type,
        filename: doc.filename,
        mimeType: doc.mimeType,
        width: doc.width,
        height: doc.height,
        size: doc.size,
        createdAt: doc.createdAt,
      }));

      return ok(images);
    } catch (error) {
      reportError("rxImageRepository.getByNoteDate", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async deleteByNoteDate(noteDate: string): Promise<Result<void, RepositoryError>> {
    try {
      const docs = await this.db.images
        .find({ selector: { noteDate: { $eq: noteDate } } })
        .exec();

      await Promise.all(docs.map((doc) => doc.patch({ isDeleted: true })));
      return ok(undefined);
    } catch (error) {
      reportError("rxImageRepository.deleteByNoteDate", error);
      return err({ type: "IO", message: String(error) });
    }
  }
}
