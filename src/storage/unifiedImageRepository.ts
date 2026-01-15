import type { NoteImage } from "../types";
import type { ImageRepository } from "./imageRepository";
import type { ImageMetaRecord } from "./unifiedDb";
import type { KeyringProvider } from "../domain/crypto/keyring";
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
    ): Promise<NoteImage> {
      const imageId = generateUuid();
      const encrypted = await e2ee.encryptImageBlob(file);
      if (!encrypted) {
        throw new Error("Image key unavailable");
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

      return {
        id: imageId,
        noteDate: meta.noteDate,
        type: meta.type,
        filename: meta.filename,
        mimeType: meta.mimeType,
        width: meta.width,
        height: meta.height,
        size: meta.size,
        createdAt: meta.createdAt,
      };
    },

    async get(imageId: string): Promise<Blob | null> {
      try {
        const state = await getImageEnvelopeState(imageId);
        const record = state.record;
        const meta = state.meta;
        if (!record || !meta || record.version !== 1) {
          return null;
        }
        return await e2ee.decryptImageRecord(record, meta.mimeType);
      } catch {
        return null;
      }
    },

    async getUrl(_imageId: string): Promise<string | null> {
      void _imageId;
      return null;
    },

    async delete(imageId: string): Promise<void> {
      const meta = (await getImageEnvelopeState(imageId)).meta;
      if (meta) {
        await setImageMeta({
          ...meta,
          pendingOp: "delete",
        });
        await deleteImageRecord(imageId);
        return;
      }

      await deleteImageRecords(imageId);
    },

    async getByNoteDate(noteDate: string): Promise<NoteImage[]> {
      const metas = await getMetaByDate(noteDate);
      return metas
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
        }));
    },

    async deleteByNoteDate(noteDate: string): Promise<void> {
      const metas = await getMetaByDate(noteDate);

      if (!metas.length) {
        await deleteImagesByDate(noteDate);
        return;
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
    },
  };
}
