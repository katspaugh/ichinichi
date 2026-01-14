import {
  REMOTE_NOTE_INDEX_STORE,
  openUnifiedDb,
  type RemoteNoteIndexRecord,
} from "./unifiedDb";

function getYearKeyRange(year: number): IDBKeyRange {
  return IDBKeyRange.only(year);
}

export async function getRemoteDatesForYear(
  year: number,
): Promise<string[]> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMOTE_NOTE_INDEX_STORE, "readonly");
    const store = tx.objectStore(REMOTE_NOTE_INDEX_STORE);
    const index = store.index("year");
    const request = index.getAll(getYearKeyRange(year));
    request.onsuccess = () => {
      const records = request.result as RemoteNoteIndexRecord[];
      resolve(records.map((record) => record.date));
    };
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function hasRemoteDate(date: string): Promise<boolean> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMOTE_NOTE_INDEX_STORE, "readonly");
    const store = tx.objectStore(REMOTE_NOTE_INDEX_STORE);
    const request = store.get(date);
    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteRemoteDate(date: string): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMOTE_NOTE_INDEX_STORE, "readwrite");
    tx.objectStore(REMOTE_NOTE_INDEX_STORE).delete(date);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function setRemoteDatesForYear(
  year: number,
  dates: string[],
): Promise<void> {
  const db = await openUnifiedDb();
  const tx = db.transaction(REMOTE_NOTE_INDEX_STORE, "readwrite");
  const store = tx.objectStore(REMOTE_NOTE_INDEX_STORE);
  const index = store.index("year");
  const now = new Date().toISOString();

  const clearExisting = new Promise<void>((resolve, reject) => {
    const request = index.openCursor(getYearKeyRange(year));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });

  await clearExisting;

  for (const date of dates) {
    store.put({ date, year, fetchedAt: now });
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
