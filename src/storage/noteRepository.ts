import type { Note } from '../types';
import type { RepositoryError } from '../domain/errors';
import { ok, err, type Result } from '../domain/result';
import { encryptNote, decryptNote } from '../crypto';
import {
  getCachedNote,
  setCachedNote,
  deleteCachedNote,
  getAllCachedDates,
  type CachedNoteRecord,
} from './cache';
import type { RemoteNotes } from './remoteNotes';
import { extractSectionTypes } from '../utils/sectionTypes';
import { reportError } from '../utils/errorReporter';

export interface ConnectivitySource {
  getOnline(): boolean;
}

export interface NoteRepository {
  get(date: string): Promise<Result<Note | null, RepositoryError>>;
  save(date: string, content: string): Promise<Result<void, RepositoryError>>;
  delete(date: string): Promise<Result<void, RepositoryError>>;
  getAllDates(): Promise<Result<string[], RepositoryError>>;
  getAllDatesForYear(year: number): Promise<Result<string[], RepositoryError>>;
}

interface NoteRepositoryDeps {
  dek: CryptoKey;
  keyId: string;
  remote: RemoteNotes;
  connectivity: ConnectivitySource;
}

export function createNoteRepository(deps: NoteRepositoryDeps): NoteRepository {
  const { dek, keyId, remote, connectivity } = deps;

  return {
    async get(date) {
      try {
        const cached = await getCachedNote(date);

        if (cached) {
          const content = await decryptNote(cached, dek);
          const sectionTypes = extractSectionTypes(content);
          return ok({ date, content, sectionTypes, updatedAt: cached.updatedAt });
        }

        if (!connectivity.getOnline()) {
          return ok(null);
        }

        // Fetch from remote, find matching row
        const rows = await remote.fetchNotesSince(null);
        const row = rows.find((r) => r.date === date && !r.deleted);
        if (!row) return ok(null);

        const record: CachedNoteRecord = {
          date: row.date,
          ciphertext: row.ciphertext,
          nonce: row.nonce,
          keyId: row.key_id,
          updatedAt: row.updated_at,
          revision: row.revision,
          remoteId: row.id,
        };
        await setCachedNote(record);

        const content = await decryptNote(record, dek);
        const sectionTypes = extractSectionTypes(content);
        return ok({ date, content, sectionTypes, updatedAt: record.updatedAt });
      } catch (e) {
        reportError('noteRepository.get', e);
        return err({ type: 'Unknown', message: String(e) });
      }
    },

    async save(date, content) {
      if (!connectivity.getOnline()) {
        return err({ type: 'Offline', message: 'Cannot save while offline' });
      }

      try {
        const encrypted = await encryptNote(content, dek, keyId);
        const cached = await getCachedNote(date);

        const revision = cached ? cached.revision + 1 : 1;
        const id = cached?.remoteId ?? crypto.randomUUID();

        const row = await remote.pushNote({
          id,
          date,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          keyId: encrypted.keyId,
          revision,
          updatedAt: new Date().toISOString(),
        });

        await setCachedNote({
          date: row.date,
          ciphertext: row.ciphertext,
          nonce: row.nonce,
          keyId: row.key_id,
          updatedAt: row.updated_at,
          revision: row.revision,
          remoteId: row.id,
        });

        return ok(undefined);
      } catch (e) {
        const msg = String(e);
        if (msg.includes('Conflict')) {
          return err({ type: 'Conflict', message: msg });
        }
        reportError('noteRepository.save', e);
        return err({ type: 'Unknown', message: msg });
      }
    },

    async delete(date) {
      if (!connectivity.getOnline()) {
        return err({ type: 'Offline', message: 'Cannot delete while offline' });
      }

      try {
        const cached = await getCachedNote(date);

        if (!cached?.remoteId) {
          await deleteCachedNote(date);
          return ok(undefined);
        }

        await remote.deleteNote(cached.remoteId, cached.revision);
        await deleteCachedNote(date);
        return ok(undefined);
      } catch (e) {
        reportError('noteRepository.delete', e);
        return err({ type: 'Unknown', message: String(e) });
      }
    },

    async getAllDates() {
      try {
        const dates = await getAllCachedDates();
        return ok(dates);
      } catch (e) {
        reportError('noteRepository.getAllDates', e);
        return err({ type: 'Unknown', message: String(e) });
      }
    },

    async getAllDatesForYear(year) {
      try {
        const dates = await getAllCachedDates();
        const filtered = dates.filter((d) => {
          const parts = d.split('-');
          return parts[2] === String(year);
        });
        return ok(filtered);
      } catch (e) {
        reportError('noteRepository.getAllDatesForYear', e);
        return err({ type: 'Unknown', message: String(e) });
      }
    },
  };
}
