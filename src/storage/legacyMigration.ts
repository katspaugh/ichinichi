import type { AppDatabase } from "./rxdb/database";
import type { SavedWeather } from "../types/index";
import type { E2eeService } from "../domain/crypto/e2eeService";
import { reportError } from "../utils/errorReporter";

export interface LegacyEncryptedNote {
  date: string;
  keyId?: string | null;
  ciphertext: string;
  nonce: string;
  updatedAt: string;
}

export interface LegacyImageMeta {
  id: string;
  noteDate: string;
  type: "background" | "inline";
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
}

export interface LegacyEncryptedImageData {
  keyId?: string | null;
  ciphertext: string;
  nonce: string;
}

export interface LegacyDataSource {
  getNotes(): Promise<LegacyEncryptedNote[]>;
  getImages(): Promise<LegacyImageMeta[]>;
  getImageData(id: string): Promise<LegacyEncryptedImageData | null>;
  destroy(): Promise<void>;
}

export interface LegacyMigrationResult {
  migratedNotes: number;
  migratedImages: number;
  failedNotes: number;
  failedImages: number;
}

export interface DecryptedLegacyNote {
  date: string;
  content: string;
  updatedAt: string;
  weather?: SavedWeather | null;
}

/**
 * Decrypt legacy notes using the provided E2ee service. Notes whose DEK is
 * missing from the keyring (or which fail to decrypt) are skipped. Returned
 * in the source order.
 */
export async function decryptLegacyNotes(
  source: LegacyDataSource,
  e2ee: E2eeService,
): Promise<DecryptedLegacyNote[]> {
  const encrypted = await source.getNotes();
  const out: DecryptedLegacyNote[] = [];
  for (const note of encrypted) {
    try {
      const payload = await e2ee.decryptNoteRecord({
        keyId: note.keyId ?? null,
        ciphertext: note.ciphertext,
        nonce: note.nonce,
      });
      if (!payload) continue;
      out.push({
        date: note.date,
        content: payload.content,
        updatedAt: note.updatedAt,
        weather: payload.weather ?? null,
      });
    } catch (error) {
      reportError("legacyMigration.decryptLegacyNotes", error);
    }
  }
  return out;
}

/**
 * Migrates data from a legacy encrypted IndexedDB store into the RxDB database.
 * Requires an E2eeService whose keyring holds DEKs for the legacy records;
 * notes or images whose keys are not available are skipped and counted as
 * failures so the caller can retry later (e.g. after more keys load).
 */
export async function migrateLegacyData(
  db: AppDatabase,
  source: LegacyDataSource,
  e2ee: E2eeService,
): Promise<LegacyMigrationResult> {
  const result: LegacyMigrationResult = {
    migratedNotes: 0,
    migratedImages: 0,
    failedNotes: 0,
    failedImages: 0,
  };

  try {
    const notes = await source.getNotes();
    for (const note of notes) {
      const existing = await db.notes.findOne(note.date).exec();
      if (existing) continue;

      let payload: { content: string; weather?: SavedWeather | null } | null;
      try {
        payload = await e2ee.decryptNoteRecord({
          keyId: note.keyId ?? null,
          ciphertext: note.ciphertext,
          nonce: note.nonce,
        });
      } catch (error) {
        reportError("legacyMigration.decryptNote", error);
        payload = null;
      }

      if (!payload) {
        result.failedNotes++;
        continue;
      }

      await db.notes.insert({
        date: note.date,
        content: payload.content,
        updatedAt: note.updatedAt,
        isDeleted: false,
        weather: payload.weather ?? null,
      });
      result.migratedNotes++;
    }

    const images = await source.getImages();
    for (const image of images) {
      const existing = await db.images.findOne(image.id).exec();
      if (existing) continue;

      const encrypted = await source.getImageData(image.id);
      let blob: Blob | null = null;
      if (encrypted) {
        try {
          blob = await e2ee.decryptImageRecord(
            {
              keyId: encrypted.keyId ?? null,
              ciphertext: encrypted.ciphertext,
              nonce: encrypted.nonce,
            },
            image.mimeType,
          );
        } catch (error) {
          reportError("legacyMigration.decryptImage", error);
          blob = null;
        }
      }

      if (!blob) {
        result.failedImages++;
        continue;
      }

      const doc = await db.images.insert({
        id: image.id,
        noteDate: image.noteDate,
        type: image.type,
        filename: image.filename,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        size: image.size,
        createdAt: image.createdAt,
        isDeleted: false,
      });

      await doc.putAttachment({
        id: "blob",
        data: blob,
        type: image.mimeType,
      });
      result.migratedImages++;
    }

    await source.destroy();
  } catch (error) {
    reportError("legacyMigration.migrateLegacyData", error);
    throw error;
  }

  return result;
}
