import type { E2eeServiceFactory } from "../crypto/e2eeService";
import type { KeyringProvider } from "../crypto/keyring";
import type { SyncError } from "../errors";
import type { Result } from "../result";
import { SyncStatus, type Note } from "../../types";
import type { NoteRepository } from "../../storage/noteRepository";
import type { NoteRecord } from "../../storage/unifiedDb";
import type { UnifiedSyncedNoteEnvelopeRepository } from "../../storage/unifiedSyncedNoteRepository";

export interface UnifiedSyncedNoteRepository extends NoteRepository {
  sync(): Promise<Result<SyncStatus, SyncError>>;
  getSyncStatus(): SyncStatus;
  onSyncStatusChange(callback: (status: SyncStatus) => void): () => void;
  getAllDatesForYear(year: number): Promise<string[]>;
  getAllLocalDates(): Promise<string[]>;
  getAllLocalDatesForYear(year: number): Promise<string[]>;
  refreshNote(date: string): Promise<Note | null>;
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
    async get(date: string): Promise<Note | null> {
      const envelope = await envelopeRepo.getEnvelope(date);
      if (!envelope) return null;
      const content = await e2ee.decryptNoteRecord(
        envelopeToRecord(envelope),
      );
      if (!content) return null;
      return {
        date: envelope.date,
        content,
        updatedAt: envelope.updatedAt,
      };
    },

    async save(date: string, content: string): Promise<void> {
      const encrypted = await e2ee.encryptNoteContent(content);
      if (!encrypted) return;
      await envelopeRepo.saveEnvelope({
        date,
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        keyId: encrypted.keyId,
        updatedAt: new Date().toISOString(),
      });
    },

    async delete(date: string): Promise<void> {
      await envelopeRepo.deleteEnvelope(date);
    },

    async getAllDates(): Promise<string[]> {
      return await envelopeRepo.getAllDates();
    },

    async getAllDatesForYear(year: number): Promise<string[]> {
      return await envelopeRepo.getAllDatesForYear(year);
    },

    async getAllLocalDates(): Promise<string[]> {
      return await envelopeRepo.getAllLocalDates();
    },

    async getAllLocalDatesForYear(year: number): Promise<string[]> {
      return await envelopeRepo.getAllLocalDatesForYear(year);
    },

    async refreshNote(date: string): Promise<Note | null> {
      const envelope = await envelopeRepo.refreshEnvelope(date);
      if (!envelope) return null;
      const content = await e2ee.decryptNoteRecord(
        envelopeToRecord(envelope),
      );
      if (!content) return null;
      return {
        date: envelope.date,
        content,
        updatedAt: envelope.updatedAt,
      };
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
