import { STORAGE_PREFIX } from "../utils/constants";
import {
  base64ToBytes,
  bytesToBase64,
  encodeUtf8,
  randomBytes,
} from "./cryptoUtils";

const VAULT_META_KEY = `${STORAGE_PREFIX}vault_meta_v1`;
const DB_NAME = "dailynotes-vault";
const STORE_NAME = "keys";
const DEVICE_KEY_ID = "device";
const KDF_ITERATIONS = 600000;
const WRAP_IV_BYTES = 12;

export interface VaultMeta {
  version: 1;
  kdf: {
    salt: string;
    iterations: number;
  };
  wrapped: {
    password: { iv: string; data: string };
    device?: { iv: string; data: string };
  };
}

export function hasVaultMeta(): boolean {
  return !!localStorage.getItem(VAULT_META_KEY);
}

export function loadVaultMeta(): VaultMeta | null {
  const raw = localStorage.getItem(VAULT_META_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VaultMeta;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveVaultMeta(meta: VaultMeta): void {
  localStorage.setItem(VAULT_META_KEY, JSON.stringify(meta));
}

const IDB_TIMEOUT_MS = 3000;
const IDB_MAX_RETRIES = 3;

function openDeviceKeyDbOnce(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("IndexedDB open timeout"));
    }, IDB_TIMEOUT_MS);

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
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

let cachedDeviceDb: IDBDatabase | null = null;
let deviceDbOpenPromise: Promise<IDBDatabase> | null = null;

async function openDeviceKeyDbWithRetry(): Promise<IDBDatabase> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < IDB_MAX_RETRIES; attempt++) {
    try {
      return await openDeviceKeyDbOnce();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < IDB_MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error("IndexedDB open failed");
}

async function openDeviceKeyDb(): Promise<IDBDatabase> {
  if (cachedDeviceDb) {
    try {
      if (cachedDeviceDb.objectStoreNames.length > 0) {
        return cachedDeviceDb;
      }
    } catch {
      cachedDeviceDb = null;
    }
  }

  if (deviceDbOpenPromise) {
    return deviceDbOpenPromise;
  }

  deviceDbOpenPromise = openDeviceKeyDbWithRetry();
  try {
    cachedDeviceDb = await deviceDbOpenPromise;
    cachedDeviceDb.onclose = () => {
      cachedDeviceDb = null;
    };
    cachedDeviceDb.onerror = () => {
      cachedDeviceDb = null;
    };
    return cachedDeviceDb;
  } finally {
    deviceDbOpenPromise = null;
  }
}

/** Close cached connection (for testing) */
export function closeVaultDb(): void {
  if (cachedDeviceDb) {
    cachedDeviceDb.close();
    cachedDeviceDb = null;
  }
}

async function getDeviceKey(): Promise<CryptoKey | null> {
  const db = await openDeviceKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(DEVICE_KEY_ID);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

async function setDeviceKey(key: CryptoKey): Promise<void> {
  const db = await openDeviceKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(key, DEVICE_KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const existing = await getDeviceKey();
  if (existing) return existing;

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
  await setDeviceKey(key);
  return key;
}

export async function canUseDeviceKey(): Promise<boolean> {
  try {
    await getOrCreateDeviceKey();
    return true;
  } catch {
    return false;
  }
}

async function derivePasswordKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encodeUtf8(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

// Exported KEK derivation for Supabase auth integration
export async function deriveKEK(
  password: string,
  saltBase64: string,
  iterations: number,
): Promise<CryptoKey> {
  const salt = base64ToBytes(saltBase64);
  return derivePasswordKey(password, salt, iterations);
}

// Generate a new random DEK (Data Encryption Key)
export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

// Wrap DEK with KEK for storage
export async function wrapDEK(
  dek: CryptoKey,
  kek: CryptoKey,
): Promise<{ iv: string; data: string }> {
  const iv = randomBytes(WRAP_IV_BYTES);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, {
    name: "AES-GCM",
    iv,
  });
  return {
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(wrapped)),
  };
}

// Unwrap DEK using KEK
export async function unwrapDEK(
  wrappedData: string,
  iv: string,
  kek: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    base64ToBytes(wrappedData),
    kek,
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// Generate a random salt for KEK derivation
export function generateSalt(): string {
  return bytesToBase64(randomBytes(16));
}

// Export default iterations for new users
export const DEFAULT_KDF_ITERATIONS = KDF_ITERATIONS;

// Device-wrapped DEK for offline unlock
const DEVICE_DEK_ID = "device_dek";

export async function storeDeviceWrappedDEK(dek: CryptoKey): Promise<void> {
  try {
    const deviceKey = await getOrCreateDeviceKey();
    const wrapped = await wrapDEK(dek, deviceKey);
    const db = await openDeviceKeyDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(wrapped, DEVICE_DEK_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Device key storage unavailable
  }
}

export async function tryUnlockWithDeviceDEK(): Promise<CryptoKey | null> {
  try {
    const deviceKey = await getDeviceKey();
    if (!deviceKey) return null;

    const db = await openDeviceKeyDb();
    const wrapped = await new Promise<{ iv: string; data: string } | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(DEVICE_DEK_ID);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      },
    );

    if (!wrapped) return null;
    return await unwrapDEK(wrapped.data, wrapped.iv, deviceKey);
  } catch {
    return null;
  }
}

export async function clearDeviceWrappedDEK(): Promise<void> {
  try {
    const db = await openDeviceKeyDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(DEVICE_DEK_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore errors
  }
}

async function wrapVaultKey(
  vaultKey: CryptoKey,
  wrappingKey: CryptoKey,
): Promise<{ iv: string; data: string }> {
  const iv = randomBytes(WRAP_IV_BYTES);
  const wrapped = await crypto.subtle.wrapKey("raw", vaultKey, wrappingKey, {
    name: "AES-GCM",
    iv,
  });
  return {
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(wrapped)),
  };
}

async function unwrapVaultKey(
  wrapped: { iv: string; data: string },
  wrappingKey: CryptoKey,
): Promise<CryptoKey> {
  const iv = base64ToBytes(wrapped.iv);
  const data = base64ToBytes(wrapped.data);
  return crypto.subtle.unwrapKey(
    "raw",
    data,
    wrappingKey,
    { name: "AES-GCM", iv },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function createVault(
  password: string,
  options?: { kdfIterations?: number },
): Promise<CryptoKey> {
  const salt = randomBytes(16);
  const iterations = options?.kdfIterations ?? KDF_ITERATIONS;
  const passwordKey = await derivePasswordKey(password, salt, iterations);
  const vaultKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  const passwordWrapped = await wrapVaultKey(vaultKey, passwordKey);
  let deviceWrapped: VaultMeta["wrapped"]["device"];
  try {
    const deviceKey = await getOrCreateDeviceKey();
    deviceWrapped = await wrapVaultKey(vaultKey, deviceKey);
  } catch {
    deviceWrapped = undefined;
  }

  const meta: VaultMeta = {
    version: 1,
    kdf: {
      salt: bytesToBase64(salt),
      iterations,
    },
    wrapped: {
      password: passwordWrapped,
      ...(deviceWrapped ? { device: deviceWrapped } : {}),
    },
  };

  saveVaultMeta(meta);
  return vaultKey;
}

export async function createRandomVault(): Promise<CryptoKey> {
  const randomPassword = bytesToBase64(randomBytes(32));
  return createVault(randomPassword);
}

export async function updatePasswordWrappedKey(
  vaultKey: CryptoKey,
  password: string,
  options?: { kdfIterations?: number },
): Promise<void> {
  const meta = loadVaultMeta();
  if (!meta) return;
  const salt = randomBytes(16);
  const iterations = options?.kdfIterations ?? KDF_ITERATIONS;
  const passwordKey = await derivePasswordKey(password, salt, iterations);
  const passwordWrapped = await wrapVaultKey(vaultKey, passwordKey);
  const nextMeta: VaultMeta = {
    ...meta,
    kdf: {
      salt: bytesToBase64(salt),
      iterations,
    },
    wrapped: {
      ...meta.wrapped,
      password: passwordWrapped,
    },
  };
  saveVaultMeta(nextMeta);
}

export async function unlockWithPassword(password: string): Promise<CryptoKey> {
  const meta = loadVaultMeta();
  if (!meta) {
    throw new Error("Vault not initialized");
  }
  const salt = base64ToBytes(meta.kdf.salt);
  const passwordKey = await derivePasswordKey(
    password,
    salt,
    meta.kdf.iterations,
  );
  return unwrapVaultKey(meta.wrapped.password, passwordKey);
}

export async function tryUnlockWithDeviceKey(): Promise<CryptoKey | null> {
  const meta = loadVaultMeta();
  if (!meta?.wrapped.device) return null;
  const deviceKey = await getDeviceKey();
  if (!deviceKey) return null;
  try {
    return await unwrapVaultKey(meta.wrapped.device, deviceKey);
  } catch {
    return null;
  }
}

export async function ensureDeviceWrappedKey(
  vaultKey: CryptoKey,
): Promise<void> {
  const meta = loadVaultMeta();
  if (!meta) return;
  try {
    const deviceKey = await getOrCreateDeviceKey();
    const deviceWrapped = await wrapVaultKey(vaultKey, deviceKey);
    const nextMeta: VaultMeta = {
      ...meta,
      wrapped: {
        ...meta.wrapped,
        device: deviceWrapped,
      },
    };
    saveVaultMeta(nextMeta);
  } catch {
    // Device key not available; keep password-only unlock.
  }
}
