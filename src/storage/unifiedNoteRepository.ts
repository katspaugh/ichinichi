import type { Note } from "../types";
import type { NoteRepository } from "./noteRepository";
import type { NoteMetaRecord, NoteRecord } from "./unifiedDb";
import {
  setNoteAndMeta,
  deleteNoteAndMeta,
} from "./unifiedNoteStore";
import { createE2eeService } from "../services/e2eeService";
import type { KeyringProvider } from "../domain/crypto/keyring";
import {
  getAllNoteEnvelopeStates,
  getNoteEnvelopeState,
} from "./unifiedNoteEnvelopeRepository";

export function createUnifiedNoteRepository(
  keyring: KeyringProvider,
): UnifiedNoteRepository {
  const e2ee = createE2eeService(keyring);

  return {
    async get(date: string): Promise<Note | null> {
      try {
        const state = await getNoteEnvelopeState(date);
        const record = state.record;
        if (!record || record.version !== 1) {
          return null;
        }
        const content = await e2ee.decryptNoteRecord(record);
        if (!content) return null;
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
      const existingMeta = (await getNoteEnvelopeState(date)).meta;
      const encrypted = await e2ee.encryptNoteContent(content);
      if (!encrypted) {
        return;
      }
      const { ciphertext, nonce, keyId } = encrypted;
      const updatedAt = new Date().toISOString();

      const record: NoteRecord = {
        version: 1,
        date,
        keyId,
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
      const states = await getAllNoteEnvelopeStates();
      return states
        .map((state) => state.record?.date)
        .filter((date): date is string => Boolean(date));
    },

    async getAllDatesForYear(year: number): Promise<string[]> {
      const suffix = String(year);
      const states = await getAllNoteEnvelopeStates();
      return states
        .map((state) => state.record?.date)
        .filter((date): date is string => Boolean(date))
        .filter((date) => date.endsWith(suffix));
    },
  };
}

export interface UnifiedNoteRepository extends NoteRepository {
  getAllDatesForYear(year: number): Promise<string[]>;
}
