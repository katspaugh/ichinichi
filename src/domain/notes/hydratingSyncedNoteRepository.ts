import type { E2eeServiceFactory } from "../crypto/e2eeService";
import type { KeyringProvider } from "../crypto/keyring";
import type { RepositoryError, SyncError } from "../errors";
import { ok, err, type Result } from "../result";
import { SyncStatus, type Note, type HabitValues } from "../../types";
import type { NoteRepository } from "../../storage/noteRepository";
import type { NoteRecord } from "../../storage/unifiedDb";
import type { UnifiedSyncedNoteEnvelopeRepository } from "../../storage/unifiedSyncedNoteRepository";

export interface UnifiedSyncedNoteRepository extends NoteRepository {
  sync(): Promise<Result<SyncStatus, SyncError>>;
  getSyncStatus(): SyncStatus;
  onSyncStatusChange(callback: (status: SyncStatus) => void): () => void;
  getAllDatesForYear(year: number): Promise<Result<string[], RepositoryError>>;
  getAllLocalDates(): Promise<Result<string[], RepositoryError>>;
  getAllLocalDatesForYear(year: number): Promise<Result<string[], RepositoryError>>;
  refreshNote(date: string): Promise<Result<Note | null, RepositoryError>>;
  hasPendingOp(date: string): Promise<boolean>;
  refreshDates(year: number): Promise<void>;
  hasRemoteDateCached(date: string): Promise<boolean>;
}

function envelopeToRecord(envelope: {
  date: string;
  keyId: string;
  ciphertext: string;
  nonce: string;
  updatedAt: string;
}): NoteRecord {
  return {
    version: 1,
    date: envelope.date,
    keyId: envelope.keyId,
    ciphertext: envelope.ciphertext,
    nonce: envelope.nonce,
    updatedAt: envelope.updatedAt,
  };
}

export function createHydratingSyncedNoteRepository(
  envelopeRepo: UnifiedSyncedNoteEnvelopeRepository,
  keyring: KeyringProvider,
  e2eeFactory: E2eeServiceFactory,
): UnifiedSyncedNoteRepository {
  const e2ee = e2eeFactory.create(keyring);

  return {
    async get(date: string): Promise<Result<Note | null, RepositoryError>> {
      try {
        const envelope = await envelopeRepo.getEnvelope(date);
        if (!envelope) return ok(null);
        const payload = await e2ee.decryptNoteRecord(
          envelopeToRecord(envelope),
        );
        if (!payload) {
          return err({ type: "DecryptFailed", message: "Failed to decrypt note" });
        }
        return ok({
          date: envelope.date,
          content: payload.content,
          habits: payload.habits,
          updatedAt: envelope.updatedAt,
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
        const encrypted = await e2ee.encryptNoteContent({ content, habits });
        if (!encrypted) {
          return err({ type: "EncryptFailed", message: "Failed to encrypt note" });
        }
        await envelopeRepo.saveEnvelope({
          date,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          keyId: encrypted.keyId,
          updatedAt: new Date().toISOString(),
        });
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
        await envelopeRepo.deleteEnvelope(date);
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
        return ok(await envelopeRepo.getAllDates());
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get all dates",
        });
      }
    },

    async getAllDatesForYear(year: number): Promise<Result<string[], RepositoryError>> {
      try {
        return ok(await envelopeRepo.getAllDatesForYear(year));
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get dates for year",
        });
      }
    },

    async getAllLocalDates(): Promise<Result<string[], RepositoryError>> {
      try {
        return ok(await envelopeRepo.getAllLocalDates());
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get local dates",
        });
      }
    },

    async getAllLocalDatesForYear(year: number): Promise<Result<string[], RepositoryError>> {
      try {
        return ok(await envelopeRepo.getAllLocalDatesForYear(year));
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get local dates for year",
        });
      }
    },

    async refreshNote(date: string): Promise<Result<Note | null, RepositoryError>> {
      try {
        const envelope = await envelopeRepo.refreshEnvelope(date);
        if (!envelope) return ok(null);
        const payload = await e2ee.decryptNoteRecord(
          envelopeToRecord(envelope),
        );
        if (!payload) {
          return err({ type: "DecryptFailed", message: "Failed to decrypt note" });
        }
        return ok({
          date: envelope.date,
          content: payload.content,
          habits: payload.habits,
          updatedAt: envelope.updatedAt,
        });
      } catch (error) {
        return err({
          type: "Unknown",
          message: error instanceof Error ? error.message : "Failed to refresh note",
        });
      }
    },

    async hasPendingOp(date: string): Promise<boolean> {
      return await envelopeRepo.hasPendingOp(date);
    },

    async refreshDates(year: number): Promise<void> {
      await envelopeRepo.refreshDates(year);
    },

    async hasRemoteDateCached(date: string): Promise<boolean> {
      return await envelopeRepo.hasRemoteDateCached(date);
    },

    sync: envelopeRepo.sync,
    getSyncStatus: envelopeRepo.getSyncStatus,
    onSyncStatusChange: envelopeRepo.onSyncStatusChange,
  };
}
