import type { E2eeServiceFactory } from "../crypto/e2eeService";
import type { KeyringProvider } from "../crypto/keyring";
import type { RepositoryError } from "../errors";
import { ok, err, type Result } from "../result";
import type { NoteImage } from "../../types";
import type { ImageRepository } from "../../storage/imageRepository";
import type { ImageMetaRecord, ImageRecord } from "../../storage/unifiedDb";
import {
  deleteImageRecord,
  deleteImageRecords,
  deleteImagesByDate,
  getMetaByDate,
  setImageMeta,
  storeImageAndMeta,
} from "../../storage/unifiedImageStore";
import { getImageEnvelopeState } from "../../storage/unifiedImageEnvelopeRepository";

function toNoteImage(meta: ImageMetaRecord): NoteImage {
  return {
    id: meta.id,
    noteDate: meta.noteDate,
    type: meta.type,
    filename: meta.filename,
    mimeType: meta.mimeType,
    width: meta.width,
    height: meta.height,
    size: meta.size,
    createdAt: meta.createdAt,
  };
}

export function createHydratingImageRepository(
  keyring: KeyringProvider,
  e2eeFactory: E2eeServiceFactory,
): ImageRepository {
  const e2ee = e2eeFactory.create(keyring);

  return {
    async upload(
      noteDate: string,
      file: Blob,
      type: "background" | "inline",
      filename: string,
      options?: { width?: number; height?: number },
    ): Promise<Result<NoteImage, RepositoryError>> {
      try {
        const imageId =
          crypto.randomUUID?.() ??
          "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
        const encrypted = await e2ee.encryptImageBlob(file);
        if (!encrypted) {
          return err({ type: "KeyMissing", message: "Image key unavailable" });
        }

        const meta: ImageMetaRecord = {
          id: imageId,
          noteDate,
          type,
          filename,
          mimeType: file.type || "application/octet-stream",
          width: options?.width ?? 0,
          height: options?.height ?? 0,
          size: encrypted.size,
          createdAt: new Date().toISOString(),
          sha256: encrypted.sha256,
          keyId: encrypted.keyId,
          pendingOp: "upload",
        };

        const record: ImageRecord = {
          ...encrypted.record,
          id: imageId,
        };

        await storeImageAndMeta(record, meta);
        return ok(toNoteImage(meta));
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to upload image",
        });
      }
    },

    async get(imageId: string): Promise<Result<Blob | null, RepositoryError>> {
      try {
        const state = await getImageEnvelopeState(imageId);
        if (!state.record || !state.meta) {
          return ok(null);
        }
        const blob = await e2ee.decryptImageRecord(state.record, state.meta.mimeType);
        if (!blob) {
          return err({ type: "DecryptFailed", message: "Failed to decrypt image" });
        }
        return ok(blob);
      } catch (error) {
        return err({
          type: "Unknown",
          message: error instanceof Error ? error.message : "Failed to get image",
        });
      }
    },

    async getUrl(_imageId: string): Promise<Result<string | null, RepositoryError>> {
      void _imageId;
      return ok(null);
    },

    async delete(imageId: string): Promise<Result<void, RepositoryError>> {
      try {
        const meta = (await getImageEnvelopeState(imageId)).meta;
        if (meta) {
          await setImageMeta({
            ...meta,
            pendingOp: "delete",
          });
          await deleteImageRecord(imageId);
          return ok(undefined);
        }

        await deleteImageRecords(imageId);
        return ok(undefined);
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to delete image",
        });
      }
    },

    async getByNoteDate(noteDate: string): Promise<Result<NoteImage[], RepositoryError>> {
      try {
        const metas = await getMetaByDate(noteDate);
        return ok(
          metas
            .filter((meta) => meta.pendingOp !== "delete")
            .map(toNoteImage)
        );
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get images by date",
        });
      }
    },

    async deleteByNoteDate(noteDate: string): Promise<Result<void, RepositoryError>> {
      try {
        await deleteImagesByDate(noteDate);
        return ok(undefined);
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to delete images by date",
        });
      }
    },
  };
}
