import type { SupabaseClient } from "@supabase/supabase-js";
import { SyncStatus, type Note } from "../types";
import type { NoteRepository } from "./noteRepository";
import {
  createUnifiedNoteRepository,
  type KeyringProvider,
  type UnifiedNoteRepository,
} from "./unifiedNoteRepository";
import {
  decryptNoteContent,
  getAllNoteMeta,
  getAllNoteRecords,
  getNoteMeta,
  getNoteRecord,
  setNoteAndMeta,
  setNoteMeta,
  deleteNoteRecord,
  deleteNoteAndMeta,
} from "./unifiedNoteStore";
import type { NoteMetaRecord, NoteRecord } from "./unifiedDb";
import {
  fetchRemoteNoteByDate,
  fetchRemoteNoteDates,
  deleteRemoteNote,
  pushRemoteNote,
  RevisionConflictError,
  type RemoteNote,
} from "./unifiedSyncService";
import { syncEncryptedImages } from "./unifiedImageSyncService";
import {
  deleteRemoteDate,
  getRemoteDatesForYear,
  hasRemoteDate,
  setRemoteDatesForYear,
} from "./remoteNoteIndexStore";

/** Thrown when trying to access a stub note while offline */
export class OfflineStubError extends Error {
  constructor() {
    super("Note exists but cannot be loaded while offline");
    this.name = "OfflineStubError";
  }
}

export interface UnifiedSyncedNoteRepository extends NoteRepository {
  sync(): Promise<void>;
  getSyncStatus(): SyncStatus;
  onSyncStatusChange(callback: (status: SyncStatus) => void): () => void;
  getAllDatesForYear(year: number): Promise<string[]>;
  getAllLocalDates(): Promise<string[]>;
  getAllLocalDatesForYear(year: number): Promise<string[]>;
  getWithRefresh(
    date: string,
    onRemoteUpdate: (note: Note | null) => void,
  ): Promise<Note | null>;
}

function toLocalRecord(remote: RemoteNote): NoteRecord {
  return {
    version: 1,
    date: remote.date,
    keyId: remote.keyId,
    ciphertext: remote.ciphertext,
    nonce: remote.nonce,
    updatedAt: remote.updatedAt,
  };
}

function toLocalMeta(remote: RemoteNote): NoteMetaRecord {
  return {
    date: remote.date,
    revision: remote.revision,
    remoteId: remote.id,
    serverUpdatedAt: remote.serverUpdatedAt,
    lastSyncedAt: new Date().toISOString(),
    pendingOp: null,
  };
}

async function decryptLocalNote(
  record: NoteRecord,
  keyring: KeyringProvider,
): Promise<Note | null> {
  const keyId = record.keyId ?? keyring.activeKeyId;
  const key = keyring.getKey(keyId);
  if (!key) return null;
  const content = await decryptNoteContent(key, record);
  return {
    date: record.date,
    content,
    updatedAt: record.updatedAt,
  };
}

interface ConflictResolutionContext {
  supabase: SupabaseClient;
  userId: string;
  keyring: KeyringProvider;
  localRecord: NoteRecord;
  localMeta: NoteMetaRecord;
  remote: RemoteNote;
}

async function resolveConflict(
  ctx: ConflictResolutionContext,
): Promise<RemoteNote> {
  const { supabase, userId, keyring, localRecord, localMeta, remote } = ctx;
  const localRevision = localMeta.revision;
  const remoteRevision = remote.revision;

  // Determine winner: higher revision wins, tie-break by timestamp
  const localWins =
    localRevision > remoteRevision ||
    (localRevision === remoteRevision &&
      new Date(localRecord.updatedAt).getTime() >=
        new Date(remote.updatedAt).getTime());

  if (!localWins) {
    return remote;
  }

  // Local wins - try to push with rebased revision
  try {
    const rebasedRevision =
      localRevision > remoteRevision ? localRevision : remoteRevision + 1;

    return await pushRemoteNote(supabase, userId, {
      id: localMeta.remoteId ?? remote.id,
      date: localRecord.date,
      ciphertext: localRecord.ciphertext,
      nonce: localRecord.nonce,
      keyId: localRecord.keyId ?? keyring.activeKeyId,
      revision: rebasedRevision,
      updatedAt: localRecord.updatedAt,
      serverUpdatedAt: remote.serverUpdatedAt,
      deleted: false,
    });
  } catch (rebaseError) {
    // Rebased push failed, accept remote version as fallback
    console.warn("Rebased push failed, accepting remote version:", rebaseError);
    return remote;
  }
}

export function createUnifiedSyncedNoteRepository(
  supabase: SupabaseClient,
  userId: string,
  keyring: KeyringProvider,
): UnifiedSyncedNoteRepository {
  const localRepo: UnifiedNoteRepository = createUnifiedNoteRepository(keyring);
  let syncStatus: SyncStatus = SyncStatus.Idle;
  const listeners = new Set<(status: SyncStatus) => void>();

  const setSyncStatus = (status: SyncStatus) => {
    syncStatus = status;
    listeners.forEach((cb) => cb(status));
  };

  const sync = async (): Promise<void> => {
    if (!navigator.onLine) {
      setSyncStatus(SyncStatus.Offline);
      return;
    }

    setSyncStatus(SyncStatus.Syncing);

    try {
      const [records, metas] = await Promise.all([
        getAllNoteRecords(),
        getAllNoteMeta(),
      ]);

      const recordMap = new Map(records.map((record) => [record.date, record]));

      // Push pending local changes.
      for (const meta of metas) {
        if (!meta.pendingOp) continue;
        const record = recordMap.get(meta.date);
        const now = new Date().toISOString();

        if (meta.pendingOp === "delete") {
          await deleteRemoteNote(supabase, userId, {
            id: meta.remoteId ?? undefined,
            date: meta.date,
          });
          await deleteRemoteDate(meta.date);
          await deleteNoteAndMeta(meta.date);
          continue;
        }

        if (!record) continue;

        try {
          const remote = await pushRemoteNote(supabase, userId, {
            id: meta.remoteId,
            date: record.date,
            ciphertext: record.ciphertext,
            nonce: record.nonce,
            keyId: record.keyId ?? keyring.activeKeyId,
            revision: meta.revision,
            updatedAt: record.updatedAt,
            serverUpdatedAt: meta.serverUpdatedAt ?? null,
            deleted: false,
          });
          await setNoteAndMeta(toLocalRecord(remote), {
            ...toLocalMeta(remote),
            lastSyncedAt: now,
          });
        } catch (error) {
          if (!(error instanceof RevisionConflictError)) {
            throw error;
          }

          const remote = await fetchRemoteNoteByDate(
            supabase,
            userId,
            record.date,
          );
          if (!remote) {
            throw error;
          }

          const resolved = await resolveConflict({
            supabase,
            userId,
            keyring,
            localRecord: record,
            localMeta: meta,
            remote,
          });
          await setNoteAndMeta(toLocalRecord(resolved), {
            ...toLocalMeta(resolved),
            lastSyncedAt: now,
          });
        }
      }

      await syncEncryptedImages(supabase, userId);

      setSyncStatus(SyncStatus.Synced);
    } catch (error) {
      console.error("Sync error:", error);
      setSyncStatus(SyncStatus.Error);
    }
  };

  const getLocalDates = async (year?: number): Promise<string[]> => {
    const records = await getAllNoteRecords();
    return records
      .map((record) => record.date)
      .filter((date) =>
        typeof year === "number" ? date.endsWith(String(year)) : true,
      );
  };

  const getMergedDates = async (year?: number): Promise<string[]> => {
    const localDates = await getLocalDates(year);

    if (typeof year !== "number") {
      return localDates;
    }

    if (!navigator.onLine) {
      return localDates;
    }

    try {
      const remoteDates = await fetchRemoteNoteDates(supabase, userId, year);
      await setRemoteDatesForYear(year, remoteDates);

      const merged = new Set<string>([...remoteDates, ...localDates]);
      return Array.from(merged);
    } catch {
      const remoteDates = await getRemoteDatesForYear(year);
      const merged = new Set<string>([...remoteDates, ...localDates]);
      return Array.from(merged);
    }
  };

  const getLocalSnapshot = async (
    date: string,
  ): Promise<{
    record: NoteRecord | null;
    meta: NoteMetaRecord | null;
    note: Note | null;
  }> => {
    const [record, meta] = await Promise.all([
      getNoteRecord(date),
      getNoteMeta(date),
    ]);
    const note = record ? await decryptLocalNote(record, keyring) : null;
    return { record, meta, note };
  };

  const pushLocal = async (
    record: NoteRecord,
    meta: NoteMetaRecord,
  ): Promise<RemoteNote | null> => {
    try {
      return await pushRemoteNote(supabase, userId, {
        id: meta.remoteId,
        date: record.date,
        ciphertext: record.ciphertext,
        nonce: record.nonce,
        keyId: record.keyId ?? keyring.activeKeyId,
        revision: meta.revision,
        updatedAt: record.updatedAt,
        serverUpdatedAt: meta.serverUpdatedAt ?? null,
        deleted: false,
      });
    } catch (error) {
      if (!(error instanceof RevisionConflictError)) {
        throw error;
      }
    }

    const remote = await fetchRemoteNoteByDate(supabase, userId, record.date);
    if (!remote) {
      return null;
    }

    return await resolveConflict({
      supabase,
      userId,
      keyring,
      localRecord: record,
      localMeta: meta,
      remote,
    });
  };

  const reconcileRemote = async (
    date: string,
    localRecord: NoteRecord | null,
    localMeta: NoteMetaRecord | null,
  ): Promise<Note | null> => {
    let remote: RemoteNote | null = null;
    try {
      remote = await fetchRemoteNoteByDate(supabase, userId, date);
    } catch {
      return localRecord ? await decryptLocalNote(localRecord, keyring) : null;
    }

    const meta: NoteMetaRecord | null =
      localMeta ??
      (localRecord
        ? {
            date,
            revision: 1,
            remoteId: null,
            serverUpdatedAt: null,
            lastSyncedAt: null,
            pendingOp: "upsert",
          }
        : null);

    if (meta?.pendingOp === "delete") {
      if (remote) {
        await deleteRemoteNote(supabase, userId, {
          id: meta.remoteId ?? undefined,
          date,
        });
      }
      await deleteRemoteDate(date);
      await deleteNoteAndMeta(date);
      return null;
    }

    if (!remote || remote.deleted) {
      if (!localRecord || !meta) {
        return null;
      }

      if (meta.pendingOp === "upsert") {
        const pushed = await pushLocal(localRecord, meta);
        if (pushed) {
          await setNoteAndMeta(toLocalRecord(pushed), toLocalMeta(pushed));
        }
        return await decryptLocalNote(localRecord, keyring);
      }

      await deleteRemoteDate(localRecord.date);
      await deleteNoteAndMeta(localRecord.date);
      return null;
    }

    if (!localRecord || !meta) {
      await setNoteAndMeta(toLocalRecord(remote), toLocalMeta(remote));
      return await decryptLocalNote(toLocalRecord(remote), keyring);
    }

    // Skip conflict resolution if local is already synced with this remote version
    if (meta.serverUpdatedAt === remote.serverUpdatedAt && !meta.pendingOp) {
      return await decryptLocalNote(localRecord, keyring);
    }

    // Resolve conflict between local and remote
    const resolved = await resolveConflict({
      supabase,
      userId,
      keyring,
      localRecord,
      localMeta: meta,
      remote,
    });

    // Update local state with resolved version
    await setNoteAndMeta(toLocalRecord(resolved), toLocalMeta(resolved));
    return await decryptLocalNote(toLocalRecord(resolved), keyring);
  };

  return {
    ...localRepo,
    async delete(date: string): Promise<void> {
      const existingMeta = await getNoteMeta(date);
      const meta: NoteMetaRecord = {
        date,
        revision: (existingMeta?.revision ?? 0) + 1,
        remoteId: existingMeta?.remoteId ?? null,
        serverUpdatedAt: existingMeta?.serverUpdatedAt ?? null,
        lastSyncedAt: existingMeta?.lastSyncedAt ?? null,
        pendingOp: "delete",
      };

      await setNoteMeta(meta);
      await deleteNoteRecord(date);
      await deleteRemoteDate(date);
    },
    async getWithRefresh(
      date: string,
      onRemoteUpdate: (note: Note | null) => void,
    ): Promise<Note | null> {
      const { record, meta, note } = await getLocalSnapshot(date);

      if (!navigator.onLine) {
        if (meta?.pendingOp === "delete") {
          return null;
        }
        if (!note && !record && (await hasRemoteDate(date))) {
          throw new OfflineStubError();
        }
        return note;
      }

      void (async () => {
        const updated = await reconcileRemote(date, record, meta);
        if (!note && updated) {
          onRemoteUpdate(updated);
          return;
        }
        if (note && !updated) {
          onRemoteUpdate(null);
          return;
        }
        if (note && updated && note.updatedAt !== updated.updatedAt) {
          onRemoteUpdate(updated);
        }
      })();

      return note;
    },
    async get(date: string): Promise<Note | null> {
      if (!navigator.onLine) {
        const snapshot = await getLocalSnapshot(date);
        return snapshot.note;
      }
      const snapshot = await getLocalSnapshot(date);
      return await reconcileRemote(date, snapshot.record, snapshot.meta);
    },
    async getAllDates(): Promise<string[]> {
      return await getMergedDates();
    },
    async getAllDatesForYear(year: number): Promise<string[]> {
      return await getMergedDates(year);
    },
    async getAllLocalDates(): Promise<string[]> {
      return await getLocalDates();
    },
    async getAllLocalDatesForYear(year: number): Promise<string[]> {
      return await getLocalDates(year);
    },
    sync,
    getSyncStatus(): SyncStatus {
      return syncStatus;
    },
    onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}
