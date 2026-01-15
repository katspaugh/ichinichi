import type { E2eeServiceFactory } from "../crypto/e2eeService";
import type { KeyringProvider } from "../crypto/keyring";
import type { Note } from "../../types";
import type { NoteRepository } from "../../storage/noteRepository";
import {
  getAllNoteEnvelopeStates,
  getNoteEnvelopeState,
} from "../../storage/unifiedNoteEnvelopeRepository";
import { deleteNoteAndMeta, setNoteAndMeta } from "../../storage/unifiedNoteStore";
import type { NoteMetaRecord, NoteRecord } from "../../storage/unifiedDb";

export function createHydratingNoteRepository(
  keyring: KeyringProvider,
  e2eeFactory: E2eeServiceFactory,
): NoteRepository {
  const e2ee = e2eeFactory.create(keyring);

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
      const state = await getNoteEnvelopeState(date);
      const encrypted = await e2ee.encryptNoteContent(content);
      if (!encrypted) {
        return;
      }
      const updatedAt = new Date().toISOString();
      const record: NoteRecord = {
        version: 1,
        date,
        keyId: encrypted.keyId,
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        updatedAt,
      };

      const existingMeta = state.meta;
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
        .filter((value): value is string => Boolean(value));
    },
  };
}
