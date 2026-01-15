import type { E2eeServiceFactory } from "../crypto/e2eeService";
import type { KeyringProvider } from "../crypto/keyring";
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
    ): Promise<NoteImage> {
      const imageId =
        crypto.randomUUID?.() ??
        "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      const encrypted = await e2ee.encryptImageBlob(file);
      if (!encrypted) {
        throw new Error("Image key unavailable");
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
      return toNoteImage(meta);
    },

    async get(imageId: string): Promise<Blob | null> {
      const state = await getImageEnvelopeState(imageId);
      if (!state.record || !state.meta) {
        return null;
      }
      return await e2ee.decryptImageRecord(state.record, state.meta.mimeType);
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
        .map(toNoteImage);
    },

    async deleteByNoteDate(noteDate: string): Promise<void> {
      await deleteImagesByDate(noteDate);
    },
  };
}
