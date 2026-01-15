import { base64ToBytes, decodeUtf8 } from "./cryptoUtils";
import { setNoteAndMeta } from "./unifiedNoteStore";
import { storeImageAndMeta } from "./unifiedImageStore";
import { computeKeyId } from "./keyId";
import { createE2eeService } from "../services/e2eeService";
import type { KeyringProvider } from "../domain/crypto/keyring";
import type {
  ImageMetaRecord,
  ImageRecord,
  NoteMetaRecord,
  NoteRecord,
} from "./unifiedDb";
import type { NoteImage } from "../types";

const MIGRATION_KEY = "dailynotes_unified_migrated_v1";

const LEGACY_NOTES_DB = "dailynotes-notes";
const LEGACY_NOTES_STORE = "notes";
const LEGACY_SYNCED_DB = "dailynotes-synced";
const LEGACY_SYNCED_STORE = "notes";
const LEGACY_IMAGES_DB = "dailynotes-images";
const LEGACY_IMAGES_STORE = "images";
const LEGACY_IMAGES_META_STORE = "image_meta";

interface LegacyEncryptedNotePayload {
  version: 1;
  iv: string;
  data: string;
}

interface LegacySyncedPayload {
  id?: string;
  date: string;
  iv: string;
  data: string;
  revision: number;
  updatedAt: string;
  serverUpdatedAt?: string;
  deleted?: boolean;
  dirty?: boolean;
}

interface LegacyImagePayload {
  version: 1;
  iv: string;
  data: string;
}

interface MigrationOptions {
  targetKey: CryptoKey;
  localKey: CryptoKey | null;
  cloudKey: CryptoKey | null;
}

interface LegacyNoteCandidate {
  source: "local" | "synced";
  date: string;
  content: string;
  updatedAt: string;
  revision: number;
  remoteId?: string | null;
  serverUpdatedAt?: string | null;
  dirty: boolean;
  keyId: string | null;
}

function hasMigrationFlag(): boolean {
  return (
    typeof window !== "undefined" && localStorage.getItem(MIGRATION_KEY) === "1"
  );
}

function setMigrationFlag(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(MIGRATION_KEY, "1");
  }
}

async function legacyDbExists(name: string): Promise<boolean> {
  if (!("databases" in indexedDB)) {
    return true;
  }
  const databases = await indexedDB.databases();
  return databases.some((db) => db.name === name);
}

async function openLegacyDb(name: string): Promise<IDBDatabase | null> {
  const exists = await legacyDbExists(name);
  if (!exists) return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllFromStore<T>(
  dbName: string,
  storeName: string,
): Promise<T[]> {
  const db = await openLegacyDb(dbName);
  if (!db) return [];
  if (!db.objectStoreNames.contains(storeName)) {
    db.close();
    return [];
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getAllFromStoreWithKeys<T>(
  dbName: string,
  storeName: string,
): Promise<Array<{ key: string; value: T }>> {
  const db = await openLegacyDb(dbName);
  if (!db) return [];
  if (!db.objectStoreNames.contains(storeName)) {
    db.close();
    return [];
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const valuesRequest = store.getAll();
    const keysRequest = store.getAllKeys();
    let values: T[] = [];
    let keys: IDBValidKey[] = [];
    valuesRequest.onsuccess = () => {
      values = valuesRequest.result as T[];
    };
    keysRequest.onsuccess = () => {
      keys = keysRequest.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(keys.map((key, i) => ({ key: String(key), value: values[i]! })));
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function decryptLegacyNote(
  key: CryptoKey,
  payload: LegacyEncryptedNotePayload,
): Promise<{ content: string; updatedAt: string }> {
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return JSON.parse(decodeUtf8(new Uint8Array(decrypted))) as {
    content: string;
    updatedAt: string;
  };
}

async function decryptLegacySynced(
  key: CryptoKey,
  payload: LegacySyncedPayload,
): Promise<{ content: string }> {
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return JSON.parse(decodeUtf8(new Uint8Array(decrypted))) as {
    content: string;
  };
}

async function decryptLegacyImage(
  key: CryptoKey,
  payload: LegacyImagePayload,
): Promise<ArrayBuffer> {
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.data);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}

function chooseWinner(
  a: LegacyNoteCandidate,
  b: LegacyNoteCandidate,
): LegacyNoteCandidate {
  const aTime = new Date(a.updatedAt).getTime();
  const bTime = new Date(b.updatedAt).getTime();
  if (aTime > bTime) return a;
  if (bTime > aTime) return b;
  return a.revision >= b.revision ? a : b;
}

export async function migrateLegacyData({
  targetKey,
  localKey,
  cloudKey,
}: MigrationOptions): Promise<boolean> {
  if (hasMigrationFlag()) {
    return false;
  }

  const candidates = new Map<string, LegacyNoteCandidate>();
  const localKeyId = localKey ? await computeKeyId(localKey) : null;
  const cloudKeyId = cloudKey ? "legacy" : null;
  const targetKeyId = await computeKeyId(targetKey);
  const keyMap = new Map<string, CryptoKey>();

  keyMap.set(targetKeyId, targetKey);
  if (localKey && localKeyId) {
    keyMap.set(localKeyId, localKey);
  }
  if (cloudKey && cloudKeyId) {
    keyMap.set(cloudKeyId, cloudKey);
  }

  const keyring: KeyringProvider = {
    activeKeyId: targetKeyId,
    getKey: (keyId: string) => keyMap.get(keyId) ?? null,
  };
  const e2ee = createE2eeService(keyring);

  if (localKey) {
    const entries = await getAllFromStoreWithKeys<LegacyEncryptedNotePayload>(
      LEGACY_NOTES_DB,
      LEGACY_NOTES_STORE,
    );

    for (const entry of entries) {
      if (!entry.value || entry.value.version !== 1) continue;
      const note = await decryptLegacyNote(localKey, entry.value);
      const candidate: LegacyNoteCandidate = {
        source: "local",
        date: entry.key,
        content: note.content,
        updatedAt: note.updatedAt,
        revision: 1,
        keyId: localKeyId,
        dirty: true,
      };
      candidates.set(entry.key, candidate);
    }
  }

  if (cloudKey) {
    const entries = await getAllFromStoreWithKeys<LegacySyncedPayload>(
      LEGACY_SYNCED_DB,
      LEGACY_SYNCED_STORE,
    );

    for (const entry of entries) {
      const payload = entry.value;
      if (!payload || !payload.iv || !payload.data) continue;
      if (payload.deleted) continue;
      const decrypted = await decryptLegacySynced(cloudKey, payload);
      const candidate: LegacyNoteCandidate = {
        source: "synced",
        date: entry.key,
        content: decrypted.content,
        updatedAt: payload.updatedAt,
        revision: payload.revision ?? 1,
        remoteId: payload.id ?? null,
        serverUpdatedAt: payload.serverUpdatedAt ?? null,
        dirty: payload.dirty ?? false,
        keyId: cloudKeyId,
      };

      const existing = candidates.get(entry.key);
      if (!existing) {
        candidates.set(entry.key, candidate);
      } else {
        const winner = chooseWinner(existing, candidate);
        const merged: LegacyNoteCandidate = {
          ...winner,
          remoteId: candidate.remoteId ?? existing.remoteId ?? null,
          serverUpdatedAt:
            candidate.serverUpdatedAt ?? existing.serverUpdatedAt ?? null,
        };
        candidates.set(entry.key, merged);
      }
    }
  }

  for (const candidate of candidates.values()) {
    if (!candidate.keyId) {
      continue;
    }
    const encrypted = await e2ee.encryptNoteContent(
      candidate.content,
      candidate.keyId,
    );
    if (!encrypted) continue;
    const { ciphertext, nonce, keyId } = encrypted;
    const record: NoteRecord = {
      version: 1,
      date: candidate.date,
      keyId,
      ciphertext,
      nonce,
      updatedAt: candidate.updatedAt,
    };

    const pendingOp: NoteMetaRecord["pendingOp"] =
      candidate.source === "local" || candidate.dirty ? "upsert" : null;

    const meta: NoteMetaRecord = {
      date: candidate.date,
      revision: candidate.revision || 1,
      remoteId: candidate.remoteId ?? null,
      serverUpdatedAt: candidate.serverUpdatedAt ?? null,
      lastSyncedAt: null,
      pendingOp,
    };

    await setNoteAndMeta(record, meta);
  }

  if (localKey) {
    const legacyMetas = await getAllFromStore<NoteImage>(
      LEGACY_IMAGES_DB,
      LEGACY_IMAGES_META_STORE,
    );
    const payloadEntries = await getAllFromStoreWithKeys<LegacyImagePayload>(
      LEGACY_IMAGES_DB,
      LEGACY_IMAGES_STORE,
    );
    const payloadMap = new Map(
      payloadEntries.map((entry) => [entry.key, entry.value]),
    );
    const imageKeyId = localKeyId ?? (await computeKeyId(localKey));

    for (const meta of legacyMetas) {
      const payload = payloadMap.get(meta.id);
      if (!payload || payload.version !== 1) continue;
      const decrypted = await decryptLegacyImage(localKey, payload);
      const encrypted = await e2ee.encryptImageBlob(
        new Blob([decrypted], {
          type: meta.mimeType || "application/octet-stream",
        }),
        imageKeyId,
      );
      if (!encrypted) continue;

      const record: ImageRecord = {
        ...encrypted.record,
        id: meta.id,
      };

      const imageMeta: ImageMetaRecord = {
        id: meta.id,
        noteDate: meta.noteDate,
        type: meta.type,
        filename: meta.filename,
        mimeType: meta.mimeType,
        width: meta.width,
        height: meta.height,
        size: meta.size,
        createdAt: meta.createdAt,
        sha256: encrypted.sha256,
        keyId: encrypted.keyId,
        pendingOp: "upload",
      };

      await storeImageAndMeta(record, imageMeta);
    }
  }

  setMigrationFlag();
  return true;
}
