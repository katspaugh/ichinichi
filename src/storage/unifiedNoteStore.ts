import { sanitizeHtml } from "../utils/sanitize";
import {
  base64ToBytes,
  bytesToBase64,
  encodeUtf8,
  decodeUtf8,
  randomBytes,
} from "./cryptoUtils";
import {
  NOTES_STORE,
  NOTE_META_STORE,
  openUnifiedDb,
  type NoteMetaRecord,
  type NoteRecord,
} from "./unifiedDb";

const NOTE_IV_BYTES = 12;

export async function encryptNoteContent(
  vaultKey: CryptoKey,
  content: string,
): Promise<{ ciphertext: string; nonce: string }> {
  const iv = randomBytes(NOTE_IV_BYTES);
  const plaintext = encodeUtf8(JSON.stringify({ content }));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    vaultKey,
    plaintext,
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    nonce: bytesToBase64(iv),
  };
}

export async function decryptNoteContent(
  vaultKey: CryptoKey,
  record: NoteRecord,
): Promise<string> {
  const iv = base64ToBytes(record.nonce);
  const ciphertext = base64ToBytes(record.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    vaultKey,
    ciphertext,
  );
  const parsed = JSON.parse(decodeUtf8(new Uint8Array(decrypted))) as {
    content: string;
  };
  return sanitizeHtml(parsed.content);
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

