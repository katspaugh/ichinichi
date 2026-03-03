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
    const tx = db.transaction(NOTES_STORE, "readwrite");
    tx.objectStore(NOTES_STORE).delete(date);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteNoteAndMeta(date: string): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([NOTES_STORE, NOTE_META_STORE], "readwrite");
    tx.objectStore(NOTES_STORE).delete(date);
    tx.objectStore(NOTE_META_STORE).delete(date);
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
