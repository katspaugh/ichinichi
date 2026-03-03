import type { NoteCrypto } from "../crypto/noteCrypto";
import type { RepositoryError, SyncError } from "../errors";
import { ok, err, type Result } from "../result";
import type { Note, HabitValues, SyncStatus } from "../../types";
import type { NoteRepository } from "../../storage/noteRepository";
import type { NoteMetaRecord, NoteRecord } from "../../storage/unifiedDb";
import {
  getAllNoteEnvelopeStates,
  getNoteEnvelopeState,
} from "../../storage/unifiedNoteEnvelopeRepository";
import { deleteNoteAndMeta, setNoteAndMeta } from "../../storage/unifiedNoteStore";

export function createLocalNoteRepository(
  crypto: NoteCrypto,
): NoteRepository {
  return {
    syncCapable: false,

    async get(date: string): Promise<Result<Note | null, RepositoryError>> {
      try {
        const state = await getNoteEnvelopeState(date);
        const record = state.record;
        if (!record || record.version !== 1) {
          return ok(null);
        }
        const decrypted = await crypto.decrypt(record);
        if (!decrypted.ok) return decrypted;
        return ok({
          date: record.date,
          content: decrypted.value.content,
          habits: decrypted.value.habits,
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
        const encrypted = await crypto.encrypt(content, habits);
        if (!encrypted.ok) return encrypted;
        const updatedAt = new Date().toISOString();
        const record: NoteRecord = {
          version: 1,
          date,
          keyId: encrypted.value.keyId,
          ciphertext: encrypted.value.ciphertext,
          nonce: encrypted.value.nonce,
          updatedAt,
        };
        const existingMeta = state.meta;
        const meta: NoteMetaRecord = {
          date,
          revision: (existingMeta?.revision ?? 0) + 1,
          remoteId: existingMeta?.remoteId ?? null,
          serverUpdatedAt: existingMeta?.serverUpdatedAt ?? null,
          lastSyncedAt: existingMeta?.lastSyncedAt ?? null,
          pendingOp: null,
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
            .filter((value): value is string => Boolean(value)),
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
            .filter((date) => date.endsWith(suffix)),
        );
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get dates for year",
        });
      }
    },

    // Sync-aware no-ops
    async refreshNote(): Promise<Result<Note | null, RepositoryError>> {
      return ok(null);
    },
    async hasPendingOp(): Promise<boolean> {
      return false;
    },
    async refreshDates(): Promise<void> {
      // no-op
    },
    async hasRemoteDateCached(): Promise<boolean> {
      return false;
    },
    async getAllLocalDates(): Promise<Result<string[], RepositoryError>> {
      return this.getAllDates();
    },
    async getAllLocalDatesForYear(year: number): Promise<Result<string[], RepositoryError>> {
      return this.getAllDatesForYear(year);
    },
    async sync(): Promise<Result<SyncStatus, SyncError>> {
      return ok("idle" as SyncStatus);
    },
  };
}
