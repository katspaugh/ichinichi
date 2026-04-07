import type { AppDatabase } from "./rxdb/database";
import type { SavedWeather } from "../types/index";
import { reportError } from "../utils/errorReporter";

export interface LegacyNote {
  date: string;
  content: string;
  updatedAt: string;
  weather?: SavedWeather | null;
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

export interface LegacyDataSource {
  getNotes(): Promise<LegacyNote[]>;
  getImages(): Promise<LegacyImageMeta[]>;
  getImageBlob(id: string): Promise<Blob | null>;
  destroy(): Promise<void>;
}

export async function migrateLegacyData(
  db: AppDatabase,
  source: LegacyDataSource,
): Promise<void> {
  try {
    // Migrate notes
    const notes = await source.getNotes();
    for (const note of notes) {
      const existing = await db.notes.findOne(note.date).exec();
      if (existing) continue;

      await db.notes.insert({
        date: note.date,
        content: note.content,
        updatedAt: note.updatedAt,
        isDeleted: false,
        weather: note.weather ?? null,
      });
    }

    // Migrate images
    const images = await source.getImages();
    for (const image of images) {
      const existing = await db.images.findOne(image.id).exec();
      if (existing) continue;

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

      const blob = await source.getImageBlob(image.id);
      if (blob) {
        await doc.putAttachment({
          id: "blob",
          data: blob,
          type: image.mimeType,
        });
      }
    }

    await source.destroy();
  } catch (error) {
    reportError("legacyMigration.migrateLegacyData", error);
    throw error;
  }
}
