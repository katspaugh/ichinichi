import type { Clock } from "../domain/runtime/clock";
import type { Connectivity } from "../domain/runtime/connectivity";
import type { SyncStateStore } from "../domain/sync/syncStateStore";
import { SyncStatus, type NoteEnvelope } from "../types";
import {
  setNoteAndMeta,
  setNoteMeta,
  deleteNoteRecord,
  deleteNoteAndMeta,
} from "./unifiedNoteStore";
import type { NoteMetaRecord, NoteRecord } from "./unifiedDb";
import type { SyncError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import type {
  RemoteNote,
  RemoteNotesGateway,
} from "../domain/sync/remoteNotesGateway";
import {
  deleteRemoteDate,
  getRemoteDatesForYear,
  hasRemoteDate,
  setRemoteDatesForYear,
} from "./remoteNoteIndexStore";
import {
  getAllNoteEnvelopeStates,
  getNoteEnvelopeState,
  toNoteEnvelope,
} from "./unifiedNoteEnvelopeRepository";

// Module-level deduplication for refreshDates calls with cooldown
const refreshDatesInFlight = new Map<number, Promise<void>>();
const refreshDatesLastCompleted = new Map<number, number>();
const REFRESH_DATES_COOLDOWN_MS = 2000;

export interface UnifiedSyncedNoteEnvelopeRepository {
  sync(): Promise<Result<SyncStatus, SyncError>>;
  getSyncStatus(): SyncStatus;
  onSyncStatusChange(callback: (status: SyncStatus) => void): () => void;
  getEnvelope(date: string): Promise<NoteEnvelope | null>;
  refreshEnvelope(date: string): Promise<NoteEnvelope | null>;
  hasPendingOp(date: string): Promise<boolean>;
  saveEnvelope(payload: {
    date: string;
    ciphertext: string;
    nonce: string;
    keyId: string;
    updatedAt: string;
  }): Promise<void>;
  deleteEnvelope(date: string): Promise<void>;
  getAllDates(): Promise<string[]>;
  getAllDatesForYear(year: number): Promise<string[]>;
  getAllLocalDates(): Promise<string[]>;
  getAllLocalDatesForYear(year: number): Promise<string[]>;
  refreshDates(year: number): Promise<void>;
  hasRemoteDateCached(date: string): Promise<boolean>;
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

function toLocalMeta(remote: RemoteNote, now: string): NoteMetaRecord {
  return {
    date: remote.date,
    revision: remote.revision,
    remoteId: remote.id,
    serverUpdatedAt: remote.serverUpdatedAt,
    lastSyncedAt: now,
    pendingOp: null,
  };
}

function isSyncError(error: unknown): error is SyncError {
  if (!error || typeof error !== "object") return false;
  const record = error as { type?: string; message?: string };
  return typeof record.type === "string" && typeof record.message === "string";
}

function unwrapOrThrow<T>(result: Result<T, SyncError>): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function toUnknownSyncError(error: unknown): SyncError {
  if (error instanceof Error) {
    return { type: "Unknown", message: error.message };
  }
  if (isSyncError(error)) {
    return error;
  }
  return { type: "Unknown", message: "Sync failed." };
}

interface ConflictResolutionContext {
  gateway: RemoteNotesGateway;
  activeKeyId: string;
  localRecord: NoteRecord;
  localMeta: NoteMetaRecord;
  remote: RemoteNote;
}

async function resolveConflict(
  ctx: ConflictResolutionContext,
): Promise<RemoteNote> {
  const { gateway, activeKeyId, localRecord, localMeta, remote } = ctx;
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

    const pushed = await gateway.pushNote({
      id: localMeta.remoteId ?? remote.id,
      date: localRecord.date,
      ciphertext: localRecord.ciphertext,
      nonce: localRecord.nonce,
      keyId: localRecord.keyId ?? activeKeyId,
      revision: rebasedRevision,
      updatedAt: localRecord.updatedAt,
      serverUpdatedAt: remote.serverUpdatedAt,
      deleted: false,
    });
    return unwrapOrThrow(pushed);
  } catch (rebaseError) {
    // Rebased push failed, accept remote version as fallback
    console.warn("Rebased push failed, accepting remote version:", rebaseError);
    return remote;
  }
}

function localWinsRemote(
  localRecord: NoteRecord,
  localMeta: NoteMetaRecord,
  remote: RemoteNote,
): boolean {
  const localRevision = localMeta.revision;
  const remoteRevision = remote.revision;
  return (
    localRevision > remoteRevision ||
    (localRevision === remoteRevision &&
      new Date(localRecord.updatedAt).getTime() >=
        new Date(remote.updatedAt).getTime())
  );
}

export function createUnifiedSyncedNoteEnvelopeRepository(
  gateway: RemoteNotesGateway,
  activeKeyId: string,
  syncImages: () => Promise<void>,
  connectivity: Connectivity,
  clock: Clock,
  syncStateStore: SyncStateStore,
): UnifiedSyncedNoteEnvelopeRepository {
  let syncStatus: SyncStatus = SyncStatus.Idle;
  const listeners = new Set<(status: SyncStatus) => void>();

  const setSyncStatus = (status: SyncStatus) => {
    syncStatus = status;
    listeners.forEach((cb) => cb(status));
  };

  const sync = async (): Promise<Result<SyncStatus, SyncError>> => {
    if (!connectivity.isOnline()) {
      setSyncStatus(SyncStatus.Offline);
      return ok(SyncStatus.Offline);
    }

    setSyncStatus(SyncStatus.Syncing);

    try {
      const states = await getAllNoteEnvelopeStates();

      // Push pending local changes.
      for (const state of states) {
        const meta = state.meta;
        if (!meta?.pendingOp) continue;
        const record = state.record;
        const now = clock.now().toISOString();

        if (meta.pendingOp === "delete") {
          const deleted = await gateway.deleteNote({
            id: meta.remoteId ?? undefined,
            date: meta.date,
          });
          unwrapOrThrow(deleted);
          await deleteRemoteDate(meta.date);
          await deleteNoteAndMeta(meta.date);
          continue;
        }

        if (!record) continue;

        const pushed = await gateway.pushNote({
          id: meta.remoteId,
          date: record.date,
          ciphertext: record.ciphertext,
          nonce: record.nonce,
          keyId: record.keyId ?? activeKeyId,
          revision: meta.revision,
          updatedAt: record.updatedAt,
          serverUpdatedAt: meta.serverUpdatedAt ?? null,
          deleted: false,
        });

        if (pushed.ok) {
          // Re-read current meta to check if new edits happened during sync
          const currentMeta = (await getNoteEnvelopeState(record.date)).meta;
          const newEditsOccurred =
            currentMeta && currentMeta.revision > meta.revision;

          if (newEditsOccurred) {
            // New edits happened during sync - only update server metadata,
            // keep local content and pendingOp for next sync
            await setNoteMeta({
              ...currentMeta,
              remoteId: pushed.value.id,
              serverUpdatedAt: pushed.value.serverUpdatedAt,
            });
          } else {
            // No new edits - safe to overwrite with pushed content
            await setNoteAndMeta(toLocalRecord(pushed.value), {
              ...toLocalMeta(pushed.value, now),
              lastSyncedAt: now,
            });
          }
        } else if (pushed.error.type === "Conflict") {
          const remoteResult = await gateway.fetchNoteByDate(record.date);
          const remote = unwrapOrThrow(remoteResult);
          if (!remote) {
            throw { type: "Conflict", message: "Remote note missing." };
          }

          const resolved = await resolveConflict({
            gateway,
            activeKeyId,
            localRecord: record,
            localMeta: meta,
            remote,
          });
          await setNoteAndMeta(toLocalRecord(resolved), {
            ...toLocalMeta(resolved, now),
            lastSyncedAt: now,
          });
        } else {
          throw pushed.error;
        }
      }

      await syncImages();

      const syncStateResult = await syncStateStore.getState();
      const syncState = unwrapOrThrow(syncStateResult);
      const remoteUpdatesResult = await gateway.fetchNotesSince(
        syncState.cursor ?? null,
      );
      const remoteUpdates = unwrapOrThrow(remoteUpdatesResult);
      let nextCursor = syncState.cursor ?? null;
      for (const remote of remoteUpdates) {
        await applyRemoteUpdate(remote);
        nextCursor = remote.serverUpdatedAt;
      }
      if (nextCursor && nextCursor !== syncState.cursor) {
        const setResult = await syncStateStore.setState({
          id: "state",
          cursor: nextCursor,
        });
        unwrapOrThrow(setResult);
      }

      setSyncStatus(SyncStatus.Synced);
      return ok(SyncStatus.Synced);
    } catch (error) {
      const syncError = toUnknownSyncError(error);
      console.error("Sync error:", syncError);
      setSyncStatus(SyncStatus.Error);
      return err(syncError);
    }
  };

  const getLocalDates = async (year?: number): Promise<string[]> => {
    const states = await getAllNoteEnvelopeStates();
    return states
      .map((state) => state.record?.date)
      .filter((date): date is string => Boolean(date))
      .filter((date) =>
        typeof year === "number" ? date.endsWith(String(year)) : true,
      );
  };

  const refreshDates = async (year: number): Promise<void> => {
    if (!connectivity.isOnline()) {
      return;
    }
    // Deduplicate concurrent calls for the same year
    const existing = refreshDatesInFlight.get(year);
    if (existing) {
      return existing;
    }
    // Skip if we just completed a refresh recently
    const lastCompleted = refreshDatesLastCompleted.get(year);
    if (
      lastCompleted &&
      Date.now() - lastCompleted < REFRESH_DATES_COOLDOWN_MS
    ) {
      return;
    }
    const promise = (async () => {
      try {
        const remoteDatesResult = await gateway.fetchNoteDates(year);
        const remoteDates = unwrapOrThrow(remoteDatesResult);
        await setRemoteDatesForYear(year, remoteDates);
      } catch {
        return;
      } finally {
        refreshDatesInFlight.delete(year);
        refreshDatesLastCompleted.set(year, Date.now());
      }
    })();
    refreshDatesInFlight.set(year, promise);
    return promise;
  };

  const getLocalSnapshot = async (
    date: string,
  ): Promise<{
    record: NoteRecord | null;
    meta: NoteMetaRecord | null;
    envelope: NoteEnvelope | null;
  }> => {
    const state = await getNoteEnvelopeState(date);
    const record = state.record;
    const meta = state.meta;
    const envelope = record ? toNoteEnvelope(record, meta) : null;
    return { record, meta, envelope };
  };

  const pushLocal = async (
    record: NoteRecord,
    meta: NoteMetaRecord,
  ): Promise<RemoteNote | null> => {
    const pushed = await gateway.pushNote({
      id: meta.remoteId,
      date: record.date,
      ciphertext: record.ciphertext,
      nonce: record.nonce,
      keyId: record.keyId ?? activeKeyId,
      revision: meta.revision,
      updatedAt: record.updatedAt,
      serverUpdatedAt: meta.serverUpdatedAt ?? null,
      deleted: false,
    });

    if (pushed.ok) {
      return pushed.value;
    }

    if (pushed.error.type !== "Conflict") {
      throw new Error(pushed.error.message);
    }

    const remoteResult = await gateway.fetchNoteByDate(record.date);
    const remote = unwrapOrThrow(remoteResult);
    if (!remote) {
      return null;
    }

    return await resolveConflict({
      gateway,
      activeKeyId,
      localRecord: record,
      localMeta: meta,
      remote,
    });
  };

  const applyRemoteUpdate = async (remote: RemoteNote): Promise<void> => {
    const state = await getNoteEnvelopeState(remote.date);
    const localRecord = state.record;
    const localMeta = state.meta;

    const meta: NoteMetaRecord | null =
      localMeta ??
      (localRecord
        ? {
            date: remote.date,
            revision: 1,
            remoteId: null,
            serverUpdatedAt: null,
            lastSyncedAt: null,
            pendingOp: "upsert",
          }
        : null);

    if (meta?.pendingOp === "delete") {
      return;
    }

    if (remote.deleted) {
      if (!localRecord || !meta) {
        await deleteNoteAndMeta(remote.date);
        await deleteRemoteDate(remote.date);
        return;
      }

      const shouldPushLocal =
        meta.pendingOp === "upsert" ||
        localWinsRemote(localRecord, meta, remote);
      if (shouldPushLocal) {
        const pushed = await pushLocal(localRecord, meta);
        if (pushed?.deleted) {
          await deleteNoteAndMeta(remote.date);
          await deleteRemoteDate(remote.date);
          return;
        }
        if (pushed) {
          await setNoteAndMeta(
            toLocalRecord(pushed),
            toLocalMeta(pushed, clock.now().toISOString()),
          );
        }
        return;
      }

      await deleteNoteAndMeta(remote.date);
      await deleteRemoteDate(remote.date);
      return;
    }

    if (!localRecord || !meta) {
      await setNoteAndMeta(
        toLocalRecord(remote),
        toLocalMeta(remote, clock.now().toISOString()),
      );
      return;
    }

    if (meta.serverUpdatedAt === remote.serverUpdatedAt && !meta.pendingOp) {
      return;
    }

    if (meta.pendingOp === "upsert") {
      const pushed = await pushLocal(localRecord, meta);
      if (pushed?.deleted) {
        await deleteNoteAndMeta(remote.date);
        await deleteRemoteDate(remote.date);
        return;
      }
      if (pushed) {
        await setNoteAndMeta(
          toLocalRecord(pushed),
          toLocalMeta(pushed, clock.now().toISOString()),
        );
      }
      return;
    }

    const resolved = await resolveConflict({
      gateway,
      activeKeyId,
      localRecord,
      localMeta: meta,
      remote,
    });

    if (resolved.deleted) {
      await deleteNoteAndMeta(remote.date);
      await deleteRemoteDate(remote.date);
      return;
    }

    await setNoteAndMeta(
      toLocalRecord(resolved),
      toLocalMeta(resolved, clock.now().toISOString()),
    );
  };

  const reconcileRemote = async (
    date: string,
    localRecord: NoteRecord | null,
    localMeta: NoteMetaRecord | null,
  ): Promise<NoteEnvelope | null> => {
    let remote: RemoteNote | null = null;
    const remoteResult = await gateway.fetchNoteByDate(date);
    if (!remoteResult.ok) {
      return localRecord ? toNoteEnvelope(localRecord, localMeta) : null;
    }
    remote = remoteResult.value;

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
        const deleted = await gateway.deleteNote({
          id: meta.remoteId ?? undefined,
          date,
        });
        unwrapOrThrow(deleted);
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
          const now = clock.now().toISOString();
          // Re-read current state to check if new edits happened during push
          const currentState = await getNoteEnvelopeState(date);
          const currentMeta = currentState.meta;
          const currentRecord = currentState.record;
          const newEditsOccurred =
            currentMeta && currentMeta.revision > meta.revision;

          if (newEditsOccurred && currentRecord) {
            // New edits happened during push - only update server metadata,
            // keep local content and pendingOp for next sync
            await setNoteMeta({
              ...currentMeta,
              remoteId: pushed.id,
              serverUpdatedAt: pushed.serverUpdatedAt,
            });
            return toNoteEnvelope(currentRecord, {
              ...currentMeta,
              remoteId: pushed.id,
              serverUpdatedAt: pushed.serverUpdatedAt,
            });
          } else {
            // No new edits - safe to overwrite with pushed content
            const record = toLocalRecord(pushed);
            const metaRecord = toLocalMeta(pushed, now);
            await setNoteAndMeta(record, metaRecord);
            return toNoteEnvelope(record, metaRecord);
          }
        }
        return toNoteEnvelope(localRecord, meta);
      }

      await deleteRemoteDate(localRecord.date);
      await deleteNoteAndMeta(localRecord.date);
      return null;
    }

    if (!localRecord || !meta) {
      const record = toLocalRecord(remote);
      const metaRecord = toLocalMeta(remote, clock.now().toISOString());
      await setNoteAndMeta(record, metaRecord);
      return toNoteEnvelope(record, metaRecord);
    }

    // Skip conflict resolution if local is already synced with this remote version
    if (meta.serverUpdatedAt === remote.serverUpdatedAt && !meta.pendingOp) {
      return toNoteEnvelope(localRecord, meta);
    }

    // Resolve conflict between local and remote
    const resolved = await resolveConflict({
      gateway,
      activeKeyId,
      localRecord,
      localMeta: meta,
      remote,
    });

    if (resolved.deleted) {
      await deleteNoteAndMeta(remote.date);
      await deleteRemoteDate(remote.date);
      return null;
    }

    const record = toLocalRecord(resolved);
    const metaRecord = toLocalMeta(resolved, clock.now().toISOString());
    await setNoteAndMeta(record, metaRecord);
    return toNoteEnvelope(record, metaRecord);
  };

  return {
    async getEnvelope(date: string): Promise<NoteEnvelope | null> {
      const snapshot = await getLocalSnapshot(date);
      return snapshot.envelope;
    },
    async refreshEnvelope(date: string): Promise<NoteEnvelope | null> {
      if (!connectivity.isOnline()) {
        return null;
      }
      const snapshot = await getLocalSnapshot(date);
      try {
        return await reconcileRemote(date, snapshot.record, snapshot.meta);
      } catch {
        return snapshot.envelope;
      }
    },
    async hasPendingOp(date: string): Promise<boolean> {
      const state = await getNoteEnvelopeState(date);
      return Boolean(state.meta?.pendingOp);
    },
    async saveEnvelope(payload: {
      date: string;
      ciphertext: string;
      nonce: string;
      keyId: string;
      updatedAt: string;
    }): Promise<void> {
      const existingMeta = (await getNoteEnvelopeState(payload.date)).meta;
      const record: NoteRecord = {
        version: 1,
        date: payload.date,
        keyId: payload.keyId,
        ciphertext: payload.ciphertext,
        nonce: payload.nonce,
        updatedAt: payload.updatedAt,
      };
      const meta: NoteMetaRecord = {
        date: payload.date,
        revision: (existingMeta?.revision ?? 0) + 1,
        remoteId: existingMeta?.remoteId ?? null,
        serverUpdatedAt: existingMeta?.serverUpdatedAt ?? null,
        lastSyncedAt: existingMeta?.lastSyncedAt ?? null,
        pendingOp: "upsert",
      };
      await setNoteAndMeta(record, meta);
    },
    async deleteEnvelope(date: string): Promise<void> {
      const existingMeta = (await getNoteEnvelopeState(date)).meta;
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
    async getAllDates(): Promise<string[]> {
      return await getLocalDates();
    },
    async getAllDatesForYear(year: number): Promise<string[]> {
      const localDates = await getLocalDates(year);
      try {
        const remoteDates = await getRemoteDatesForYear(year);
        const merged = new Set<string>([...localDates, ...remoteDates]);
        return Array.from(merged);
      } catch {
        return localDates;
      }
    },
    async getAllLocalDates(): Promise<string[]> {
      return await getLocalDates();
    },
    async getAllLocalDatesForYear(year: number): Promise<string[]> {
      return await getLocalDates(year);
    },
    async refreshDates(year: number): Promise<void> {
      await refreshDates(year);
    },
    async hasRemoteDateCached(date: string): Promise<boolean> {
      return await hasRemoteDate(date);
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
