import type { ImageRepository } from "../imageRepository";
import type { NoteImage } from "../../types";
import type { RepositoryError } from "../../domain/errors";
import type { Result } from "../../domain/result";
import type { AppDatabase } from "./database";
import { ok, err } from "../../domain/result";
import { reportError } from "../../utils/errorReporter";

export interface RemoteBlobFetcher {
  fetch(imageId: string, noteDate: string, mimeType: string): Promise<Blob | null>;
}

export class RxDBImageRepository implements ImageRepository {
  readonly db: AppDatabase;
  private remoteFetcher: RemoteBlobFetcher | null;

  constructor(db: AppDatabase) {
    this.db = db;
    this.remoteFetcher = null;
  }

  setRemoteFetcher(fetcher: RemoteBlobFetcher | null): void {
    this.remoteFetcher = fetcher;
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
      if (attachment) {
        const data = await attachment.getData();
        return ok(data);
      }

      // Blob not available locally — download and decrypt from remote
      if (this.remoteFetcher) {
        const blob = await this.remoteFetcher.fetch(imageId, doc.noteDate, doc.mimeType);
        if (blob) {
          await doc.putAttachment({ id: "blob", data: blob, type: doc.mimeType });
          return ok(blob);
        }
      }

      return ok(null);
    } catch (error) {
      reportError("rxImageRepository.get", error);
      return err({ type: "IO", message: String(error) });
    }
  }

  async getUrl(_imageId: string): Promise<Result<string | null, RepositoryError>> {
    // Blobs in Supabase are encrypted; signed URLs can't be rendered directly.
    // Return null so ImageUrlManager falls back to the local decrypted blob via get().
    return ok(null);
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
