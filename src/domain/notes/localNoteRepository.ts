import type { NoteCrypto } from "../crypto/noteCrypto";
import type { RepositoryError } from "../errors";
import { ok, err, type Result } from "../result";
import type { Note } from "../../types";
import { extractSectionTypes } from "../../utils/sectionTypes";
import type { NoteRepository } from "../../storage/noteRepository";
import type { NoteMetaRecord, NoteRecord } from "./noteRecord";
import type { NoteEnvelopePort } from "./noteEnvelopePort";

export function createLocalNoteRepository(
  crypto: NoteCrypto,
  envelopePort: NoteEnvelopePort,
): NoteRepository {
  return {
    async get(date: string): Promise<Result<Note | null, RepositoryError>> {
      try {
        const state = await envelopePort.getState(date);
        if (state.meta?.deletedAt) return ok(null);
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
        const state = await envelopePort.getState(date);
        const encrypted = await crypto.encrypt(content);
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
          deletedAt: null,
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
        const state = await envelopePort.getState(date);
        const existingMeta = state.meta;
        const meta: NoteMetaRecord = {
          date,
          revision: (existingMeta?.revision ?? 0) + 1,
          remoteId: existingMeta?.remoteId ?? null,
          serverUpdatedAt: existingMeta?.serverUpdatedAt ?? null,
          lastSyncedAt: existingMeta?.lastSyncedAt ?? null,
          pendingOp: null,
          deletedAt: new Date().toISOString(),
        };
        await envelopePort.setMeta(meta);
        return ok(undefined);
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to delete note",
        });
      }
    },

    async getIncludingDeleted(date: string): Promise<Result<Note | null, RepositoryError>> {
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

    async restoreNote(date: string): Promise<Result<void, RepositoryError>> {
      try {
        const state = await envelopePort.getState(date);
        const meta = state.meta;
        if (!meta) {
          return err({ type: "Unknown", message: "No metadata for note" });
        }
        await envelopePort.setMeta({
          ...meta,
          deletedAt: null,
        });
        return ok(undefined);
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to restore note",
        });
      }
    },

    async getAllDates(): Promise<Result<string[], RepositoryError>> {
      try {
        return ok(await envelopePort.getAllRecordDates());
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
        const dates = await envelopePort.getAllRecordDates();
        return ok(dates.filter((date) => date.endsWith(suffix)));
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get dates for year",
        });
      }
    },
  };
}
