import type { AiMeta } from "../domain/ai/aiTypes";
import type { E2eeService } from "../domain/crypto/e2eeService";
import { NOTES_STORE, openUnifiedDb, type NoteRecord } from "./unifiedDb";

/**
 * Save encrypted AI metadata to an existing NoteRecord.
 * Updates only the AI fields (aiCiphertext, aiNonce, aiKeyId) without
 * touching the note's own ciphertext.
 */
export async function saveEncryptedAiMeta(
  date: string,
  aiMeta: AiMeta,
  e2ee: E2eeService,
): Promise<void> {
  const encrypted = await e2ee.encryptAiMeta(aiMeta);
  if (!encrypted) return;

  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, "readwrite");
    const store = tx.objectStore(NOTES_STORE);
    const getReq = store.get(date);

    getReq.onsuccess = () => {
      const existing = getReq.result as NoteRecord | undefined;
      if (!existing) {
        // Note doesn't exist (deleted between save and analysis) — skip
        resolve();
        return;
      }
      store.put({
        ...existing,
        aiCiphertext: encrypted.ciphertext,
        aiNonce: encrypted.nonce,
        aiKeyId: encrypted.keyId,
      });
    };

    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Decrypt AI metadata from a NoteRecord if present.
 */
export async function loadDecryptedAiMeta(
  record: NoteRecord,
  e2ee: E2eeService,
): Promise<AiMeta | undefined> {
  if (!record.aiCiphertext || !record.aiNonce) return undefined;
  try {
    const meta = await e2ee.decryptAiMeta({
      keyId: record.aiKeyId,
      ciphertext: record.aiCiphertext,
      nonce: record.aiNonce,
    });
    return meta ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Load and decrypt AI metadata for a given date directly from IndexedDB.
 * Used to hydrate the in-memory cache when a note is first opened.
 */
export async function loadAiMetaForDate(
  date: string,
  e2ee: E2eeService,
): Promise<AiMeta | undefined> {
  const db = await openUnifiedDb();
  const record = await new Promise<NoteRecord | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, "readonly");
      const req = tx.objectStore(NOTES_STORE).get(date);
      req.onsuccess = () => resolve(req.result as NoteRecord | undefined);
      req.onerror = () => reject(req.error);
    },
  );
  if (!record) return undefined;
  return loadDecryptedAiMeta(record, e2ee);
}
