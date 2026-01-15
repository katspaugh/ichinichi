import {
  NOTES_STORE,
  NOTE_META_STORE,
  openUnifiedDb,
  type NoteMetaRecord,
  type NoteRecord,
} from "./unifiedDb";

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
