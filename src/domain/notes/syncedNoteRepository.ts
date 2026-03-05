import type { NoteCrypto } from "../crypto/noteCrypto";
import type { NoteSyncEngine } from "../sync/noteSyncEngine";
import type { RepositoryError } from "../errors";
import { ok, err, type Result } from "../result";
import type { Note } from "../../types";
import { extractSectionTypes } from "../../utils/sectionTypes";
import type {
  SyncCapableNoteRepository,
} from "../../storage/noteRepository";
import type { NoteMetaRecord, NoteRecord } from "./noteRecord";
import type { NoteEnvelopePort } from "./noteEnvelopePort";
import type { RemoteDateIndexPort } from "./remoteDateIndexPort";

export function createSyncedNoteRepository(
  crypto: NoteCrypto,
  engine: NoteSyncEngine,
  envelopePort: NoteEnvelopePort,
  remoteDateIndex: RemoteDateIndexPort,
): SyncCapableNoteRepository {
  return {
    syncCapable: true,

    async get(date: string): Promise<Result<Note | null, RepositoryError>> {
      try {
        const state = await envelopePort.getState(date);
        const record = state.record;
        if (!record || record.version !== 1) {
          return ok(null);
        }
        const decrypted = await crypto.decrypt(record);
        if (!decrypted.ok) return decrypted;
        return ok({
          date: record.date,
          content: decrypted.value.content,
          sectionTypes: extractSectionTypes(decrypted.value.content),
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
        const encrypted = await crypto.encrypt(content);
        if (!encrypted.ok) return encrypted;
        const state = await envelopePort.getState(date);
        const existingMeta = state.meta;
        const updatedAt = new Date().toISOString();
        const record: NoteRecord = {
          version: 1,
          date,
          keyId: encrypted.value.keyId,
          ciphertext: encrypted.value.ciphertext,
          nonce: encrypted.value.nonce,
          updatedAt,
        };
        const meta: NoteMetaRecord = {
          date,
          revision: (existingMeta?.revision ?? 0) + 1,
          serverRevision: existingMeta?.serverRevision,
          remoteId: existingMeta?.remoteId ?? null,
          serverUpdatedAt: existingMeta?.serverUpdatedAt ?? null,
          lastSyncedAt: existingMeta?.lastSyncedAt ?? null,
          pendingOp: "upsert",
        };
        await envelopePort.setNoteAndMeta(record, meta);
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
        const existingMeta = (await envelopePort.getState(date)).meta;
        const meta: NoteMetaRecord = {
          date,
          revision: (existingMeta?.revision ?? 0) + 1,
          serverRevision: existingMeta?.serverRevision,
          remoteId: existingMeta?.remoteId ?? null,
          serverUpdatedAt: existingMeta?.serverUpdatedAt ?? null,
          lastSyncedAt: existingMeta?.lastSyncedAt ?? null,
          pendingOp: "delete",
        };
        await envelopePort.setMeta(meta);
        await envelopePort.deleteRecord(date);
        await remoteDateIndex.deleteDate(date);
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
        return ok(await engine.getAllDates());
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get all dates",
        });
      }
    },

    async getAllDatesForYear(year: number): Promise<Result<string[], RepositoryError>> {
      try {
        return ok(await engine.getAllDatesForYear(year));
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get dates for year",
        });
      }
    },

    async refreshNote(date: string): Promise<Result<Note | null, RepositoryError>> {
      try {
        const envelope = await engine.refreshEnvelope(date);
        if (!envelope) return ok(null);
        const decrypted = await crypto.decrypt({
          keyId: envelope.keyId,
          ciphertext: envelope.ciphertext,
          nonce: envelope.nonce,
        });
        if (!decrypted.ok) return decrypted;
        return ok({
          date: envelope.date,
          content: decrypted.value.content,
          sectionTypes: extractSectionTypes(decrypted.value.content),
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
      return await engine.hasPendingOp(date);
    },

    async refreshDates(year: number): Promise<void> {
      await engine.refreshDates(year);
    },

    async hasRemoteDateCached(date: string): Promise<boolean> {
      return await engine.hasRemoteDateCached(date);
    },

    async getAllLocalDates(): Promise<Result<string[], RepositoryError>> {
      try {
        return ok(await engine.getAllLocalDates());
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get local dates",
        });
      }
    },

    async getAllLocalDatesForYear(year: number): Promise<Result<string[], RepositoryError>> {
      try {
        return ok(await engine.getAllLocalDatesForYear(year));
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get local dates for year",
        });
      }
    },

    sync: engine.sync,
  };
}
