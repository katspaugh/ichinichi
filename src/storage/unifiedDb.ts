export const UNIFIED_DB_NAME = "dailynotes-unified";
export const UNIFIED_DB_VERSION = 2;

export const NOTES_STORE = "notes";
export const NOTE_META_STORE = "note_meta";
export const IMAGES_STORE = "images";
export const IMAGE_META_STORE = "image_meta";
export const SYNC_STATE_STORE = "sync_state";

export interface NoteRecord {
  version: 1;
  date: string;
  keyId: string;
  ciphertext: string;
  nonce: string;
  updatedAt: string;
  deleted: boolean;
}

export interface NoteMetaRecord {
  date: string;
  revision: number;
  remoteId?: string | null;
  serverUpdatedAt?: string | null;
  lastSyncedAt?: string | null;
  pendingOp?: "upsert" | "delete" | null;
}

export interface ImageRecord {
  version: 1;
  id: string;
  keyId: string;
  ciphertext: string;
  nonce: string;
}

export interface ImageMetaRecord {
  id: string;
  noteDate: string;
  type: "background" | "inline";
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
  sha256: string;
  keyId: string;
  remotePath?: string | null;
  serverUpdatedAt?: string | null;
  pendingOp?: "upload" | "delete" | null;
}

export interface SyncStateRecord {
  id: "state";
  cursor?: string | null;
}

const IDB_TIMEOUT_MS = 3000;
const IDB_MAX_RETRIES = 3;

let cachedDb: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;

function openUnifiedDbOnce(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("IndexedDB open timeout"));
    }, IDB_TIMEOUT_MS);

    const request = indexedDB.open(UNIFIED_DB_NAME, UNIFIED_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains(NOTE_META_STORE)) {
        db.createObjectStore(NOTE_META_STORE, { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(IMAGE_META_STORE)) {
        const store = db.createObjectStore(IMAGE_META_STORE, { keyPath: "id" });
        store.createIndex("noteDate", "noteDate", { unique: false });
      }
      if (!db.objectStoreNames.contains(SYNC_STATE_STORE)) {
        db.createObjectStore(SYNC_STATE_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      clearTimeout(timeoutId);
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timeoutId);
      reject(request.error);
    };
  });
}

async function openUnifiedDbWithRetry(): Promise<IDBDatabase> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < IDB_MAX_RETRIES; attempt++) {
    try {
      return await openUnifiedDbOnce();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < IDB_MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error("IndexedDB open failed");
}

export async function openUnifiedDb(): Promise<IDBDatabase> {
  // Return cached connection if still open
  if (cachedDb) {
    try {
      // Test if connection is still valid by checking objectStoreNames
      if (cachedDb.objectStoreNames.length > 0) {
        return cachedDb;
      }
    } catch {
      cachedDb = null;
    }
  }

  // If already opening, wait for that promise
  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  // Open new connection
  dbOpenPromise = openUnifiedDbWithRetry();
  try {
    cachedDb = await dbOpenPromise;
    // Handle connection close
    cachedDb.onclose = () => {
      cachedDb = null;
    };
    cachedDb.onerror = () => {
      cachedDb = null;
    };
    return cachedDb;
  } finally {
    dbOpenPromise = null;
  }
}

/** Close cached connection (for testing) */
export function closeUnifiedDb(): void {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
}
