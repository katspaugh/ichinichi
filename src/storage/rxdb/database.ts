import { createRxDatabase, addRxPlugin, type RxDatabase, type RxCollection } from "rxdb/plugins/core";
import { RxDBAttachmentsPlugin } from "rxdb/plugins/attachments";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

addRxPlugin(RxDBAttachmentsPlugin);
import {
  noteSchema,
  imageSchema,
  type NoteDocType,
  type ImageDocType,
} from "./schemas";

export type NoteCollection = RxCollection<NoteDocType>;
export type ImageCollection = RxCollection<ImageDocType>;

export type AppCollections = {
  notes: NoteCollection;
  images: ImageCollection;
};

export type AppDatabase = RxDatabase<AppCollections>;

// Singleton cache: ensures only one database per name is ever created concurrently.
const openPromises = new Map<string, Promise<AppDatabase>>();

export async function createAppDatabase(
  userId: string,
  options?: { memory?: boolean },
): Promise<AppDatabase> {
  const name = `ichinichi-${userId}`;

  // If a creation is in progress or completed, reuse it
  const existing = openPromises.get(name);
  if (existing) {
    try {
      const db = await existing;
      if (!db.closed) return db;
    } catch {
      // Previous creation failed, try again
    }
    openPromises.delete(name);
  }

  const promise = doCreate(name, options);
  openPromises.set(name, promise);

  try {
    return await promise;
  } catch (e) {
    openPromises.delete(name);
    throw e;
  }
}

async function doCreate(
  name: string,
  options?: { memory?: boolean },
): Promise<AppDatabase> {
  const storage = options?.memory
    ? getRxStorageMemory()
    : getRxStorageDexie();

  const db = await createRxDatabase<AppCollections>({
    name,
    storage,
    // Close any pre-existing database with the same name before creating.
    // This handles cases where a previous instance wasn't properly closed
    // (e.g., between test runs or after hot module replacement).
    closeDuplicates: true,
  });

  await db.addCollections({
    notes: { schema: noteSchema },
    images: { schema: imageSchema },
  });

  return db;
}
