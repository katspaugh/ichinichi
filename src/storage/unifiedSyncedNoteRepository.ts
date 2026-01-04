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
} from "./unifiedNoteStore";
import type { NoteMetaRecord, NoteRecord } from "./unifiedDb";
import {
  fetchRemoteNoteByDate,
  fetchRemoteNoteDates,
  pushRemoteNote,
  RevisionConflictError,
  type RemoteNote,
} from "./unifiedSyncService";
import { syncEncryptedImages } from "./unifiedImageSyncService";

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
    deleted: remote.deleted,
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
  isDeleted: boolean,
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
      deleted: isDeleted,
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
        if (!record) continue;

        const isDeleted = meta.pendingOp === "delete" || record.deleted;
        const now = new Date().toISOString();

        if (isDeleted) {
          if (meta.remoteId) {
            const remote = await pushRemoteNote(supabase, userId, {
              id: meta.remoteId,
              date: record.date,
              ciphertext: record.ciphertext,
              nonce: record.nonce,
              keyId: record.keyId ?? keyring.activeKeyId,
              revision: meta.revision,
              updatedAt: record.updatedAt,
              serverUpdatedAt: meta.serverUpdatedAt ?? null,
              deleted: true,
            });
            await setNoteAndMeta(
              {
                ...record,
                deleted: true,
                updatedAt: remote.updatedAt,
              },
              {
                ...meta,
                remoteId: remote.id,
                serverUpdatedAt: remote.serverUpdatedAt,
                lastSyncedAt: now,
                pendingOp: null,
              },
            );
          } else {
            await setNoteAndMeta(
              {
                ...record,
                deleted: true,
              },
              {
                ...meta,
                lastSyncedAt: now,
                pendingOp: null,
              },
            );
          }
          continue;
        }

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

          const resolved = await resolveConflict(
            {
              supabase,
              userId,
              keyring,
              localRecord: record,
              localMeta: meta,
              remote,
            },
            false,
          );
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
      .filter((record) => !record.deleted)
      .map((record) => record.date)
      .filter((date) =>
        typeof year === "number" ? date.endsWith(String(year)) : true,
      );
  };

  const getLocalDeletedDates = async (year?: number): Promise<Set<string>> => {
    const records = await getAllNoteRecords();
    return new Set(
      records
        .filter((record) => record.deleted)
        .map((record) => record.date)
        .filter((date) =>
          typeof year === "number" ? date.endsWith(String(year)) : true,
        ),
    );
  };

  const getMergedDates = async (year?: number): Promise<string[]> => {
    const localDates = await getLocalDates(year);
    const localDeletedDates = await getLocalDeletedDates(year);

    if (!navigator.onLine) {
      return localDates;
    }

    try {
      const remoteDates = await fetchRemoteNoteDates(supabase, userId, year);
      const merged = new Set<string>([...remoteDates, ...localDates]);
      localDeletedDates.forEach((date) => merged.delete(date));
      return Array.from(merged);
    } catch {
      return localDates;
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
    const note =
      record && !record.deleted
        ? await decryptLocalNote(record, keyring)
        : null;
    return { record, meta, note };
  };

  const pushLocal = async (
    record: NoteRecord,
    meta: NoteMetaRecord,
    isDeleted: boolean,
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
        deleted: isDeleted,
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

    return await resolveConflict(
      {
        supabase,
        userId,
        keyring,
        localRecord: record,
        localMeta: meta,
        remote,
      },
      isDeleted,
    );
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
      return localRecord && !localRecord.deleted
        ? await decryptLocalNote(localRecord, keyring)
        : null;
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

    if (!remote || remote.deleted) {
      if (!localRecord || !meta) {
        return null;
      }

      if (meta.pendingOp === "upsert") {
        const pushed = await pushLocal(localRecord, meta, false);
        if (pushed) {
          await setNoteAndMeta(toLocalRecord(pushed), toLocalMeta(pushed));
        }
        return localRecord.deleted
          ? null
          : await decryptLocalNote(localRecord, keyring);
      }

      if (meta.pendingOp === "delete" || localRecord.deleted) {
        return null;
      }

      await setNoteAndMeta(
        { ...localRecord, deleted: true },
        { ...meta, pendingOp: null },
      );
      return null;
    }

    if (!localRecord || localRecord.deleted || !meta) {
      await setNoteAndMeta(toLocalRecord(remote), toLocalMeta(remote));
      return await decryptLocalNote(toLocalRecord(remote), keyring);
    }

    // Skip conflict resolution if local is already synced with this remote version
    if (meta.serverUpdatedAt === remote.serverUpdatedAt && !meta.pendingOp) {
      return await decryptLocalNote(localRecord, keyring);
    }

    // Resolve conflict between local and remote
    const resolved = await resolveConflict(
      { supabase, userId, keyring, localRecord, localMeta: meta, remote },
      localRecord.deleted,
    );

    // Update local state with resolved version
    await setNoteAndMeta(toLocalRecord(resolved), toLocalMeta(resolved));
    return await decryptLocalNote(toLocalRecord(resolved), keyring);
  };

  return {
    ...localRepo,
    async getWithRefresh(
      date: string,
      onRemoteUpdate: (note: Note | null) => void,
    ): Promise<Note | null> {
      const { record, meta, note } = await getLocalSnapshot(date);

      if (!navigator.onLine) {
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
