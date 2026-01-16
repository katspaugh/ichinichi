import type { Note } from "../types";
import type { NoteRepository } from "./noteRepository";
import type { RepositoryError } from "../domain/errors";
import { ok, err, type Result } from "../domain/result";
import { sanitizeHtml } from "../utils/sanitize";
import {
  base64ToBytes,
  bytesToBase64,
  decodeUtf8,
  encodeUtf8,
  randomBytes,
} from "./cryptoUtils";

const NOTE_IV_BYTES = 12;
const NOTES_DB_NAME = "dailynotes-notes";
const NOTES_STORE = "notes";

interface EncryptedNotePayload {
  version: 1;
  iv: string;
  data: string;
}

function openNotesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NOTES_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getNotePayload(
  date: string,
): Promise<EncryptedNotePayload | null> {
  const db = await openNotesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, "readonly");
    const store = tx.objectStore(NOTES_STORE);
    const request = store.get(date);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function setNotePayload(
  date: string,
  payload: EncryptedNotePayload,
): Promise<void> {
  const db = await openNotesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, "readwrite");
    const store = tx.objectStore(NOTES_STORE);
    store.put(payload, date);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function deleteNotePayload(date: string): Promise<void> {
  const db = await openNotesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, "readwrite");
    const store = tx.objectStore(NOTES_STORE);
    store.delete(date);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getAllNoteDates(): Promise<string[]> {
  const db = await openNotesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, "readonly");
    const store = tx.objectStore(NOTES_STORE);
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result.map((key) => String(key)));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function encryptNotePayload(
  vaultKey: CryptoKey,
  note: Note,
): Promise<EncryptedNotePayload> {
  const iv = randomBytes(NOTE_IV_BYTES);
  const plaintext = encodeUtf8(JSON.stringify(note));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    vaultKey,
    plaintext,
  );
  return {
    version: 1,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptNotePayload(
  vaultKey: CryptoKey,
  payload: EncryptedNotePayload,
): Promise<Note> {
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    vaultKey,
    ciphertext,
  );
  const note = JSON.parse(decodeUtf8(new Uint8Array(decrypted))) as Note;
  note.content = sanitizeHtml(note.content);
  return note;
}

export function createEncryptedNoteRepository(
  vaultKey: CryptoKey,
): NoteRepository {
  return {
    async get(date: string): Promise<Result<Note | null, RepositoryError>> {
      try {
        const payload = await getNotePayload(date);
        if (!payload || payload.version !== 1) return ok(null);
        const note = await decryptNotePayload(vaultKey, payload);
        return ok(note);
      } catch (error) {
        return err({
          type: "DecryptFailed",
          message: error instanceof Error ? error.message : "Failed to decrypt note",
        });
      }
    },

    async save(date: string, content: string): Promise<Result<void, RepositoryError>> {
      try {
        const sanitizedContent = sanitizeHtml(content);
        const note: Note = {
          date,
          content: sanitizedContent,
          updatedAt: new Date().toISOString(),
        };
        const payload = await encryptNotePayload(vaultKey, note);
        await setNotePayload(date, payload);
        return ok(undefined);
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to save note",
        });
      }
    },

    async delete(date: string): Promise<Result<void, RepositoryError>> {
      try {
        await deleteNotePayload(date);
        return ok(undefined);
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to delete note",
        });
      }
    },

    async getAllDates(): Promise<Result<string[], RepositoryError>> {
      try {
        const dates = await getAllNoteDates();
        return ok(dates);
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get all dates",
        });
      }
    },
  };
}
