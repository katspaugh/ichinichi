import type {
  LegacyDataSource,
  LegacyEncryptedImageData,
  LegacyEncryptedNote,
  LegacyImageMeta,
} from "./legacyMigration";
import { parseSavedWeather } from "./parsers";

export const LEGACY_DB_NAME = "dailynotes-unified";

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number";
}

function parseLegacyNote(raw: Record<string, unknown>): LegacyEncryptedNote | null {
  if (!isString(raw.date)) return null;
  if (!isString(raw.ciphertext) || !isString(raw.nonce)) return null;
  return {
    date: raw.date,
    keyId: isString(raw.keyId) ? raw.keyId : null,
    ciphertext: raw.ciphertext,
    nonce: raw.nonce,
    updatedAt: isString(raw.updatedAt) ? raw.updatedAt : new Date().toISOString(),
  };
}

function parseLegacyImageMeta(raw: Record<string, unknown>): LegacyImageMeta | null {
  if (!isString(raw.id) || !isString(raw.noteDate)) return null;
  const type = raw.type === "background" || raw.type === "inline" ? raw.type : "inline";
  return {
    id: raw.id,
    noteDate: raw.noteDate,
    type,
    filename: isString(raw.filename) ? raw.filename : "",
    mimeType: isString(raw.mimeType) ? raw.mimeType : "application/octet-stream",
    width: isNumber(raw.width) ? raw.width : 0,
    height: isNumber(raw.height) ? raw.height : 0,
    size: isNumber(raw.size) ? raw.size : 0,
    createdAt: isString(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
  };
}

function parseLegacyImageData(raw: unknown): LegacyEncryptedImageData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isString(r.ciphertext) || !isString(r.nonce)) return null;
  return {
    keyId: isString(r.keyId) ? r.keyId : null,
    ciphertext: r.ciphertext,
    nonce: r.nonce,
  };
}

/**
 * Read `parseSavedWeather` attached to legacy decrypted payload form (if ever
 * stored in plaintext by an old migration). Not used for encrypted records but
 * kept for safety.
 */
export function coerceWeather(raw: unknown) {
  return parseSavedWeather(raw);
}

/**
 * Open the legacy `dailynotes-unified` IndexedDB (if it exists) and expose a
 * LegacyDataSource. Returns null when the DB is missing or does not have the
 * expected object stores.
 */
export function openLegacyIDBSource(
  dbName: string = LEGACY_DB_NAME,
): Promise<LegacyDataSource | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const request = indexedDB.open(dbName);

    request.onerror = () => resolve(null);

    // If upgrade is triggered, the DB doesn't exist in the expected format.
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      resolve(null);
    };

    request.onsuccess = () => {
      const idb = request.result;
      const storeNames = Array.from(idb.objectStoreNames);

      if (!storeNames.includes("notes")) {
        idb.close();
        resolve(null);
        return;
      }

      const metaStore = storeNames.includes("image_meta") ? "image_meta" : null;

      resolve({
        async getNotes() {
          return new Promise((res, rej) => {
            const tx = idb.transaction("notes", "readonly");
            const store = tx.objectStore("notes");
            const req = store.getAll();
            req.onsuccess = () => {
              const raw = (req.result ?? []) as Record<string, unknown>[];
              const notes = raw
                .map(parseLegacyNote)
                .filter((n): n is LegacyEncryptedNote => n !== null);
              res(notes);
            };
            req.onerror = () => rej(req.error);
          });
        },

        async getImages() {
          if (!metaStore) return [];
          return new Promise((res, rej) => {
            const tx = idb.transaction(metaStore, "readonly");
            const store = tx.objectStore(metaStore);
            const req = store.getAll();
            req.onsuccess = () => {
              const raw = (req.result ?? []) as Record<string, unknown>[];
              const images = raw
                .map(parseLegacyImageMeta)
                .filter((i): i is LegacyImageMeta => i !== null);
              res(images);
            };
            req.onerror = () => rej(req.error);
          });
        },

        async getImageData(id: string) {
          if (!storeNames.includes("images")) return null;
          return new Promise((res, rej) => {
            const tx = idb.transaction("images", "readonly");
            const store = tx.objectStore("images");
            const req = store.get(id);
            req.onsuccess = () => res(parseLegacyImageData(req.result));
            req.onerror = () => rej(req.error);
          });
        },

        async destroy() {
          idb.close();
        },
      });
    };
  });
}

/**
 * Check whether the legacy IndexedDB database exists (without opening it).
 * Falls back to returning true when `indexedDB.databases()` is unsupported —
 * callers should attempt to open and handle the null case gracefully.
 */
export async function legacyDBExists(
  dbName: string = LEGACY_DB_NAME,
): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  if (typeof indexedDB.databases !== "function") {
    // Older Firefox lacks this API. Defer to an open+probe from the caller.
    return true;
  }
  try {
    const dbs = await indexedDB.databases();
    return dbs.some((d) => d.name === dbName);
  } catch {
    return true;
  }
}
