/**
 * DEK Cache — persists the DEK in IndexedDB wrapped by a non-exportable device key.
 *
 * On first use, a device-bound AES-GCM key is generated and stored in IndexedDB.
 * The DEK is wrapped (encrypted) with this device key before storage.
 * On page reload, the device key unwraps the DEK — no password prompt needed.
 * Sign-out clears both the wrapped DEK and the device key.
 */

const DB_NAME = "ichinichi-dek-cache";
const DB_VERSION = 1;
const STORE = "keys";
const DEVICE_KEY_ID = "device-key";
const WRAPPED_DEK_ID = "wrapped-dek";

interface WrappedDekRecord {
  id: string;
  iv: string; // base64
  data: string; // base64 wrapped DEK
  keyId: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

function idbPut(db: IDBDatabase, record: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

async function getOrCreateDeviceKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await idbGet<{ id: string; key: CryptoKey }>(db, DEVICE_KEY_ID);
  if (existing?.key) return existing.key;

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-exportable
    ["wrapKey", "unwrapKey"],
  );

  await idbPut(db, { id: DEVICE_KEY_ID, key });
  return key;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes as Uint8Array<ArrayBuffer>;
}

/** Cache the DEK wrapped by a device-bound key. */
export async function cacheDek(dek: CryptoKey, keyId: string): Promise<void> {
  const db = await openDb();
  const deviceKey = await getOrCreateDeviceKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey("raw", dek, deviceKey, {
    name: "AES-GCM",
    iv,
  });
  await idbPut(db, {
    id: WRAPPED_DEK_ID,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(wrapped)),
    keyId,
  } satisfies WrappedDekRecord);
  db.close();
}

/** Load cached DEK. Returns null if not cached or device key is gone. */
export async function loadCachedDek(): Promise<{ dek: CryptoKey; keyId: string } | null> {
  const db = await openDb();
  try {
    const record = await idbGet<WrappedDekRecord>(db, WRAPPED_DEK_ID);
    if (!record) return null;

    const deviceKey = await idbGet<{ id: string; key: CryptoKey }>(db, DEVICE_KEY_ID);
    if (!deviceKey?.key) return null;

    const dek = await crypto.subtle.unwrapKey(
      "raw",
      base64ToBytes(record.data),
      deviceKey.key,
      { name: "AES-GCM", iv: base64ToBytes(record.iv) },
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    return { dek, keyId: record.keyId };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/** Clear cached DEK and device key. */
export async function clearDekCache(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject((e.target as IDBRequest).error);
    });
    db.close();
  } catch {
    // Best effort
  }
}
