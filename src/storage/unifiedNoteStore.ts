import {
  NOTES_STORE,
  NOTE_META_STORE,
  openUnifiedDb,
  type NoteMetaRecord,
  type NoteRecord,
} from "./unifiedDb";
import type { StorageError } from "../domain/errors";
import { ok, err, type Result } from "../domain/result";

function toStorageError(error: unknown): StorageError {
  if (error instanceof Error) {
    return { type: "IO", message: error.message };
  }
  return { type: "Unknown", message: "Storage operation failed" };
}

export async function getNoteRecord(date: string): Promise<NoteRecord | null> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, "readonly");
    const store = tx.objectStore(NOTES_STORE);
    const request = store.get(date);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllNoteRecordDates(): Promise<string[]> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([NOTES_STORE, NOTE_META_STORE], "readonly");
    const notesStore = tx.objectStore(NOTES_STORE);
    const metaStore = tx.objectStore(NOTE_META_STORE);
    const keysRequest = notesStore.getAllKeys();
    keysRequest.onsuccess = () => {
      const allKeys = (keysRequest.result ?? []) as string[];
      const metaRequest = metaStore.getAll();
      metaRequest.onsuccess = () => {
        const metas = metaRequest.result as NoteMetaRecord[];
        const deletedDates = new Set(
          metas.filter((m) => m.deletedAt).map((m) => m.date),
        );
        resolve(allKeys.filter((key) => !deletedDates.has(key)));
      };
      metaRequest.onerror = () => reject(metaRequest.error);
    };
    keysRequest.onerror = () => reject(keysRequest.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllNoteRecords(): Promise<NoteRecord[]> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, "readonly");
    const store = tx.objectStore(NOTES_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getNoteMeta(
  date: string,
): Promise<NoteMetaRecord | null> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTE_META_STORE, "readonly");
    const store = tx.objectStore(NOTE_META_STORE);
    const request = store.get(date);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllNoteMeta(): Promise<NoteMetaRecord[]> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTE_META_STORE, "readonly");
    const store = tx.objectStore(NOTE_META_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function setNoteAndMeta(
  record: NoteRecord,
  meta: NoteMetaRecord,
): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([NOTES_STORE, NOTE_META_STORE], "readwrite");
    tx.objectStore(NOTES_STORE).put(record);
    tx.objectStore(NOTE_META_STORE).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function setNoteMeta(meta: NoteMetaRecord): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTE_META_STORE, "readwrite");
    tx.objectStore(NOTE_META_STORE).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteNoteRecord(date: string): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTE_META_STORE, "readwrite");
    const metaStore = tx.objectStore(NOTE_META_STORE);
    const getRequest = metaStore.get(date);
    getRequest.onsuccess = () => {
      const existing = getRequest.result as NoteMetaRecord | undefined;
      if (existing) {
        metaStore.put({
          ...existing,
          deletedAt: new Date().toISOString(),
        });
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteNoteAndMeta(date: string): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTE_META_STORE, "readwrite");
    const metaStore = tx.objectStore(NOTE_META_STORE);
    const getRequest = metaStore.get(date);
    getRequest.onsuccess = () => {
      const existing = getRequest.result as NoteMetaRecord | undefined;
      if (existing) {
        metaStore.put({
          ...existing,
          deletedAt: new Date().toISOString(),
          pendingOp: null,
        });
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Result-returning wrappers ---

export async function getNoteRecordResult(
  date: string,
): Promise<Result<NoteRecord | null, StorageError>> {
  try {
    return ok(await getNoteRecord(date));
  } catch (error) {
    return err(toStorageError(error));
  }
}

export async function getAllNoteRecordsResult(): Promise<
  Result<NoteRecord[], StorageError>
> {
  try {
    return ok(await getAllNoteRecords());
  } catch (error) {
    return err(toStorageError(error));
  }
}

export async function getNoteMetaResult(
  date: string,
): Promise<Result<NoteMetaRecord | null, StorageError>> {
  try {
    return ok(await getNoteMeta(date));
  } catch (error) {
    return err(toStorageError(error));
  }
}

export async function getAllNoteMetaResult(): Promise<
  Result<NoteMetaRecord[], StorageError>
> {
  try {
    return ok(await getAllNoteMeta());
  } catch (error) {
    return err(toStorageError(error));
  }
}

export async function setNoteAndMetaResult(
  record: NoteRecord,
  meta: NoteMetaRecord,
): Promise<Result<void, StorageError>> {
  try {
    await setNoteAndMeta(record, meta);
    return ok(undefined);
  } catch (error) {
    return err(toStorageError(error));
  }
}

export async function setNoteMetaResult(
  meta: NoteMetaRecord,
): Promise<Result<void, StorageError>> {
  try {
    await setNoteMeta(meta);
    return ok(undefined);
  } catch (error) {
    return err(toStorageError(error));
  }
}

export async function deleteNoteRecordResult(
  date: string,
): Promise<Result<void, StorageError>> {
  try {
    await deleteNoteRecord(date);
    return ok(undefined);
  } catch (error) {
    return err(toStorageError(error));
  }
}

export async function deleteNoteAndMetaResult(
  date: string,
): Promise<Result<void, StorageError>> {
  try {
    await deleteNoteAndMeta(date);
    return ok(undefined);
  } catch (error) {
    return err(toStorageError(error));
  }
}

export async function markUnsyncedNotesAsPending(): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([NOTES_STORE, NOTE_META_STORE], "readwrite");
    const notesStore = tx.objectStore(NOTES_STORE);
    const metaStore = tx.objectStore(NOTE_META_STORE);
    const notesRequest = notesStore.getAllKeys();
    notesRequest.onsuccess = () => {
      const noteKeys = new Set(notesRequest.result as string[]);
      const metaRequest = metaStore.getAll();
      metaRequest.onsuccess = () => {
        const metas = metaRequest.result as NoteMetaRecord[];
        for (const meta of metas) {
          if (!meta.pendingOp && !meta.remoteId && noteKeys.has(meta.date)) {
            metaStore.put({ ...meta, pendingOp: "upsert" });
          }
        }
      };
      metaRequest.onerror = () => reject(metaRequest.error);
    };
    notesRequest.onerror = () => reject(notesRequest.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearNoteSyncMetadata(): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTE_META_STORE, "readwrite");
    const store = tx.objectStore(NOTE_META_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const metas = request.result as NoteMetaRecord[];
      metas.forEach((meta) => {
        store.put({
          ...meta,
          remoteId: null,
          serverUpdatedAt: null,
          lastSyncedAt: null,
          pendingOp: null,
        });
      });
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
