import type { E2eeServiceFactory } from "../crypto/e2eeService";
import type { KeyringProvider } from "../crypto/keyring";
import type { RepositoryError } from "../errors";
import { ok, err, type Result } from "../result";
import type { Note, HabitValues } from "../../types";
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
    async get(date: string): Promise<Result<Note | null, RepositoryError>> {
      try {
        const state = await getNoteEnvelopeState(date);
        const record = state.record;
        if (!record || record.version !== 1) {
          return ok(null);
        }
        const payload = await e2ee.decryptNoteRecord(record);
        if (!payload) {
          return err({ type: "DecryptFailed", message: "Failed to decrypt note" });
        }
        return ok({
          date: record.date,
          content: payload.content,
          habits: payload.habits,
          updatedAt: record.updatedAt,
        });
      } catch (error) {
        return err({
          type: "Unknown",
          message: error instanceof Error ? error.message : "Failed to get note",
        });
      }
    },

    async save(date: string, content: string, habits?: HabitValues): Promise<Result<void, RepositoryError>> {
      try {
        const state = await getNoteEnvelopeState(date);
        const encrypted = await e2ee.encryptNoteContent({ content, habits });
        if (!encrypted) {
          return err({ type: "EncryptFailed", message: "Failed to encrypt note" });
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
        await deleteNoteAndMeta(date);
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
        const states = await getAllNoteEnvelopeStates();
        return ok(
          states
            .map((state) => state.record?.date)
            .filter((value): value is string => Boolean(value))
        );
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get all dates",
        });
      }
    },
  };
}
