import { reportError } from '../utils/errorReporter';

const DB_NAME = 'ichinichi-cache';
const DB_VERSION = 1;

export interface CachedNoteRecord {
  date: string;       // keyPath, "DD-MM-YYYY"
  ciphertext: string;
  nonce: string;
  keyId: string;
  updatedAt: string;
  revision: number;
  remoteId: string | null;
}

export interface CachedImageRecord {
  id: string;         // keyPath, UUID
  ciphertext: string;
  nonce: string;
  keyId: string;
}

export interface CachedImageMeta {
  id: string;         // keyPath, UUID
  noteDate: string;   // indexed
  type: 'background' | 'inline';
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  sha256: string;
  remotePath: string | null;
}

export interface SyncStateRecord {
  id: string;
  cursor: string;
}

let db: IDBDatabase | null = null;

export function openCache(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains('notes')) {
        database.createObjectStore('notes', { keyPath: 'date' });
      }
      if (!database.objectStoreNames.contains('images')) {
        database.createObjectStore('images', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('image_meta')) {
        const metaStore = database.createObjectStore('image_meta', { keyPath: 'id' });
        metaStore.createIndex('noteDate', 'noteDate', { unique: false });
      }
      if (!database.objectStoreNames.contains('sync_state')) {
        database.createObjectStore('sync_state', { keyPath: 'id' });
      }
    };

    req.onsuccess = (e) => {
      db = (e.target as IDBOpenDBRequest).result;
      db.onclose = () => { db = null; };
      resolve(db);
    };

    req.onerror = (e) => {
      reject((e.target as IDBOpenDBRequest).error);
    };
  });
}

function tx(
  stores: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => void
): Promise<void> {
  return openCache().then((database) => {
    return new Promise((resolve, reject) => {
      const t = database.transaction(stores, mode);
      t.oncomplete = () => resolve();
      t.onerror = (e) => reject((e.target as IDBRequest).error);
      t.onabort = (e) => reject((e.target as IDBTransaction).error);
      fn(t);
    });
  });
}

function get<T>(store: string, key: IDBValidKey): Promise<T | null> {
  return openCache().then((database) => {
    return new Promise((resolve, reject) => {
      const t = database.transaction(store, 'readonly');
      const req = t.objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  });
}

export function getCachedNote(date: string): Promise<CachedNoteRecord | null> {
  return get<CachedNoteRecord>('notes', date);
}

export function setCachedNote(record: CachedNoteRecord): Promise<void> {
  return tx('notes', 'readwrite', (t) => {
    t.objectStore('notes').put(record);
  });
}

export function deleteCachedNote(date: string): Promise<void> {
  return tx('notes', 'readwrite', (t) => {
    t.objectStore('notes').delete(date);
  });
}

export function getAllCachedDates(): Promise<string[]> {
  return openCache().then((database) => {
    return new Promise((resolve, reject) => {
      const t = database.transaction('notes', 'readonly');
      const req = t.objectStore('notes').getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  });
}

export function getCachedImage(id: string): Promise<CachedImageRecord | null> {
  return get<CachedImageRecord>('images', id);
}

export function setCachedImage(record: CachedImageRecord, meta: CachedImageMeta): Promise<void> {
  return tx(['images', 'image_meta'], 'readwrite', (t) => {
    t.objectStore('images').put(record);
    t.objectStore('image_meta').put(meta);
  });
}

export function deleteCachedImage(id: string): Promise<void> {
  return tx(['images', 'image_meta'], 'readwrite', (t) => {
    t.objectStore('images').delete(id);
    t.objectStore('image_meta').delete(id);
  });
}

export function getImageMetaByDate(noteDate: string): Promise<CachedImageMeta[]> {
  return openCache().then((database) => {
    return new Promise((resolve, reject) => {
      const t = database.transaction('image_meta', 'readonly');
      const index = t.objectStore('image_meta').index('noteDate');
      const req = index.getAll(noteDate);
      req.onsuccess = () => resolve(req.result as CachedImageMeta[]);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  });
}

export function getImageMeta(id: string): Promise<CachedImageMeta | null> {
  return get<CachedImageMeta>('image_meta', id);
}

export function getSyncCursor(): Promise<string | null> {
  return get<SyncStateRecord>('sync_state', 'cursor').then((r) => r?.cursor ?? null);
}

export function setSyncCursor(cursor: string): Promise<void> {
  return tx('sync_state', 'readwrite', (t) => {
    t.objectStore('sync_state').put({ id: 'cursor', cursor });
  });
}

export async function clearAll(): Promise<void> {
  try {
    await tx(['notes', 'images', 'image_meta', 'sync_state'], 'readwrite', (t) => {
      t.objectStore('notes').clear();
      t.objectStore('images').clear();
      t.objectStore('image_meta').clear();
      t.objectStore('sync_state').clear();
    });
  } catch (err) {
    reportError('clearAll', err);
  }
}

export async function deleteDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject((e.target as IDBRequest).error);
    req.onblocked = () => resolve(); // Don't hang if connections linger
  });
}
