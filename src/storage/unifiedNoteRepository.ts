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
import type { RepositoryError } from "../domain/errors";
import { ok, err, type Result } from "../domain/result";

export function createUnifiedNoteRepository(
  keyring: KeyringProvider,
): UnifiedNoteRepository {
  const e2ee = createE2eeService(keyring);

  return {
    async get(date: string): Promise<Result<Note | null, RepositoryError>> {
      try {
        const state = await getNoteEnvelopeState(date);
        const record = state.record;
        if (!record || record.version !== 1) {
          return ok(null);
        }
        const content = await e2ee.decryptNoteRecord(record);
        if (!content) {
          return err({ type: "DecryptFailed", message: "Failed to decrypt note" });
        }
        return ok({
          date: record.date,
          content,
          updatedAt: record.updatedAt,
        });
      } catch (error) {
        return err({
          type: "Unknown",
          message: error instanceof Error ? error.message : "Failed to get note",
        });
      }
    },

    async save(date: string, content: string): Promise<Result<void, RepositoryError>> {
      try {
        const existingMeta = (await getNoteEnvelopeState(date)).meta;
        const encrypted = await e2ee.encryptNoteContent(content);
        if (!encrypted) {
          return err({ type: "EncryptFailed", message: "Failed to encrypt note" });
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
            .filter((date): date is string => Boolean(date))
        );
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get all dates",
        });
      }
    },

    async getAllDatesForYear(year: number): Promise<Result<string[], RepositoryError>> {
      try {
        const suffix = String(year);
        const states = await getAllNoteEnvelopeStates();
        return ok(
          states
            .map((state) => state.record?.date)
            .filter((date): date is string => Boolean(date))
            .filter((date) => date.endsWith(suffix))
        );
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get dates for year",
        });
      }
    },
  };
}

export interface UnifiedNoteRepository extends NoteRepository {
  getAllDatesForYear(year: number): Promise<Result<string[], RepositoryError>>;
}
