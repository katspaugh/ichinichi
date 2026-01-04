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

export function openUnifiedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
