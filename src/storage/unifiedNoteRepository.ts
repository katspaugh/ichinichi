import type { Note } from "../types";
import type { NoteRepository } from "./noteRepository";
import { sanitizeHtml } from "../utils/sanitize";
import type { NoteMetaRecord, NoteRecord } from "./unifiedDb";
import {
  decryptNoteContent,
  encryptNoteContent,
  getAllNoteRecords,
  getNoteMeta,
  getNoteRecord,
  setNoteAndMeta,
  deleteNoteAndMeta,
} from "./unifiedNoteStore";

export interface UnifiedNoteRepository extends NoteRepository {
  getAllDatesForYear(year: number): Promise<string[]>;
}

export interface KeyringProvider {
  activeKeyId: string;
  getKey: (keyId: string) => CryptoKey | null;
}

export function createUnifiedNoteRepository(
  keyring: KeyringProvider,
): UnifiedNoteRepository {
  return {
    async get(date: string): Promise<Note | null> {
      try {
        const record = await getNoteRecord(date);
        if (!record || record.version !== 1) {
          return null;
        }
        const keyId = record.keyId ?? keyring.activeKeyId;
        const key = keyring.getKey(keyId);
        if (!key) return null;
        const content = await decryptNoteContent(key, record);
        return {
          date: record.date,
          content,
          updatedAt: record.updatedAt,
        };
      } catch {
        return null;
      }
    },

    async save(date: string, content: string): Promise<void> {
      const sanitizedContent = sanitizeHtml(content);
      const existingMeta = await getNoteMeta(date);
      const key = keyring.getKey(keyring.activeKeyId);
      if (!key) {
        return;
      }
      const { ciphertext, nonce } = await encryptNoteContent(
        key,
        sanitizedContent,
      );
      const updatedAt = new Date().toISOString();

      const record: NoteRecord = {
        version: 1,
        date,
        keyId: keyring.activeKeyId,
        ciphertext,
        nonce,
        updatedAt,
      };

      const meta: NoteMetaRecord = {
        date,
        revision: (existingMeta?.revision ?? 0) + 1,
        remoteId: existingMeta?.remoteId ?? null,
        serverUpdatedAt: existingMeta?.serverUpdatedAt ?? null,
        lastSyncedAt: existingMeta?.lastSyncedAt ?? null,
        pendingOp: "upsert",
      };

      await setNoteAndMeta(record, meta);
    },

    async delete(date: string): Promise<void> {
      await deleteNoteAndMeta(date);
    },

    async getAllDates(): Promise<string[]> {
      const records = await getAllNoteRecords();
      return records.map((record) => record.date);
    },

    async getAllDatesForYear(year: number): Promise<string[]> {
      const suffix = String(year);
      const records = await getAllNoteRecords();
      return records
        .map((record) => record.date)
        .filter((date) => date.endsWith(suffix));
    },
  };
}
