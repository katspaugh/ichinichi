import type { NoteImage } from "../types";
import type { ImageRepository } from "./imageRepository";
import type { ImageMetaRecord } from "./unifiedDb";
import type { KeyringProvider } from "../domain/crypto/keyring";
import type { RepositoryError } from "../domain/errors";
import { ok, err, type Result } from "../domain/result";
import {
  deleteImageRecord,
  deleteImageRecords,
  deleteImagesByDate,
  getMetaByDate,
  setImageMeta,
  storeImageAndMeta,
} from "./unifiedImageStore";
import { createE2eeService } from "../services/e2eeService";
import { getImageEnvelopeState } from "./unifiedImageEnvelopeRepository";

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createUnifiedImageRepository(
  keyring: KeyringProvider,
): ImageRepository {
  const e2ee = createE2eeService(keyring);

  return {
    async upload(
      noteDate: string,
      file: Blob,
      type: "background" | "inline",
      filename: string,
      options?: { width?: number; height?: number },
    ): Promise<Result<NoteImage, RepositoryError>> {
      try {
        const imageId = generateUuid();
        const encrypted = await e2ee.encryptImageBlob(file);
        if (!encrypted) {
          return err({ type: "KeyMissing", message: "Image key unavailable" });
        }
        const { record, sha256, size, keyId } = encrypted;

        const meta: ImageMetaRecord = {
          id: imageId,
          noteDate,
          type,
          filename,
          mimeType: file.type || "application/octet-stream",
          width: options?.width ?? 0,
          height: options?.height ?? 0,
          size,
          createdAt: new Date().toISOString(),
          sha256,
          keyId,
          pendingOp: "upload",
        };

        await storeImageAndMeta(
          {
            ...record,
            id: imageId,
            keyId,
          },
          meta,
        );

        return ok({
          id: imageId,
          noteDate: meta.noteDate,
          type: meta.type,
          filename: meta.filename,
          mimeType: meta.mimeType,
          width: meta.width,
          height: meta.height,
          size: meta.size,
          createdAt: meta.createdAt,
        });
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
        const record = state.record;
        const meta = state.meta;
        if (!record || !meta || record.version !== 1) {
          return ok(null);
        }
        const blob = await e2ee.decryptImageRecord(record, meta.mimeType);
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
            .map((meta) => ({
              id: meta.id,
              noteDate: meta.noteDate,
              type: meta.type,
              filename: meta.filename,
              mimeType: meta.mimeType,
              width: meta.width,
              height: meta.height,
              size: meta.size,
              createdAt: meta.createdAt,
            }))
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
        const metas = await getMetaByDate(noteDate);

        if (!metas.length) {
          await deleteImagesByDate(noteDate);
          return ok(undefined);
        }

        await Promise.all(
          metas.map(async (meta) => {
            await setImageMeta({
              ...meta,
              pendingOp: "delete",
            });
            await deleteImageRecord(meta.id);
          }),
        );
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
