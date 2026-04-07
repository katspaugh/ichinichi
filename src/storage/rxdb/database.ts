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

export async function createAppDatabase(
  userId: string,
  options?: { memory?: boolean },
): Promise<AppDatabase> {
  const storage = options?.memory
    ? getRxStorageMemory()
    : getRxStorageDexie();

  const db = await createRxDatabase<AppCollections>({
    name: `ichinichi-${userId}`,
    storage,
  });

  await db.addCollections({
    notes: { schema: noteSchema },
    images: { schema: imageSchema },
  });

  return db;
}
