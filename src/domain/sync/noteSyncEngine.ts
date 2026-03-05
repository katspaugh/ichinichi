import type { Clock } from "../runtime/clock";
import type { Connectivity } from "../runtime/connectivity";
import type { SyncStateStore } from "./syncStateStore";
import type { SyncError } from "../errors";
import { err, ok, type Result } from "../result";
import type {
  RemoteNote,
  RemoteNotesGateway,
} from "./remoteNotesGateway";
import type { NoteMetaRecord, NoteRecord } from "../notes/noteRecord";
import type { NoteEnvelope } from "../../types";
import { SyncStatus } from "../../types";
import type { NoteEnvelopePort } from "../notes/noteEnvelopePort";
import type { RemoteDateIndexPort } from "../notes/remoteDateIndexPort";

const REFRESH_DATES_COOLDOWN_MS = 2000;

export interface NoteSyncEngine {
  sync(): Promise<Result<SyncStatus, SyncError>>;
  refreshEnvelope(date: string): Promise<NoteEnvelope | null>;
  hasPendingOp(date: string): Promise<boolean>;
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
    serverRevision: remote.revision,
    remoteId: remote.id,
    serverUpdatedAt: remote.serverUpdatedAt,
    lastSyncedAt: now,
    pendingOp: null,
  };
}

function expectedServerRevision(meta: NoteMetaRecord): number {
  return meta.serverRevision ?? (meta.remoteId ? meta.revision : 0);
}

function isSyncError(error: unknown): error is SyncError {
  if (!error || typeof error !== "object") return false;
  const record = error as { type?: string; message?: string };
  return typeof record.type === "string" && typeof record.message === "string";
}

function unwrapOrThrow<T, E>(result: Result<T, E>): T {
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

export function createNoteSyncEngine(
  gateway: RemoteNotesGateway,
  activeKeyId: string,
  syncImages: () => Promise<void>,
  connectivity: Connectivity,
  clock: Clock,
  syncStateStore: SyncStateStore,
  envelopePort: NoteEnvelopePort,
  remoteDateIndex: RemoteDateIndexPort,
): NoteSyncEngine {
  const refreshDatesInFlight = new Map<number, Promise<void>>();
  const refreshDatesLastCompleted = new Map<number, number>();

  const pushUpsert = async (
    record: NoteRecord,
    meta: NoteMetaRecord,
  ): Promise<void> => {
    const serverRev = expectedServerRevision(meta);

    const pushed = await gateway.pushNote({
      id: meta.remoteId,
      date: record.date,
      ciphertext: record.ciphertext,
      nonce: record.nonce,
      keyId: record.keyId ?? activeKeyId,
      revision: serverRev,
      updatedAt: record.updatedAt,
      deleted: false,
    });

    if (pushed.ok) {
      await applyPushSuccess(record.date, meta, pushed.value);
      return;
    }

    if (pushed.error.type !== "Conflict") {
      throw pushed.error;
    }

    // Conflict: fetch remote, update metadata, retry once
    const remoteResult = await gateway.fetchNoteByDate(record.date);
    const remote = unwrapOrThrow(remoteResult);

    if (remote) {
      // Update meta with fresh server state, then retry
      const updatedMeta: NoteMetaRecord = {
        ...meta,
        remoteId: remote.id,
        serverRevision: remote.revision,
        serverUpdatedAt: remote.serverUpdatedAt,
      };
      await envelopePort.setMeta(updatedMeta);

      const retry = await gateway.pushNote({
        id: remote.id,
        date: record.date,
        ciphertext: record.ciphertext,
        nonce: record.nonce,
        keyId: record.keyId ?? activeKeyId,
        revision: remote.revision,
        updatedAt: record.updatedAt,
        deleted: false,
      });

      if (retry.ok) {
        await applyPushSuccess(record.date, updatedMeta, retry.value);
        return;
      }
    }

    // Retry failed or no remote — leave pendingOp for next cycle
  };

  const applyPushSuccess = async (
    date: string,
    originalMeta: NoteMetaRecord,
    remote: RemoteNote,
  ): Promise<void> => {
    const now = clock.now().toISOString();
    const currentMeta = (await envelopePort.getState(date)).meta;
    const newEditsOccurred =
      currentMeta && currentMeta.revision > originalMeta.revision;

    if (newEditsOccurred) {
      // New edits during sync — only update server metadata, keep pendingOp
      await envelopePort.setMeta({
        ...currentMeta,
        remoteId: remote.id,
        serverRevision: remote.revision,
        serverUpdatedAt: remote.serverUpdatedAt,
      });
    } else {
      await envelopePort.setNoteAndMeta(toLocalRecord(remote), toLocalMeta(remote, now));
    }
  };

  const pushDelete = async (meta: NoteMetaRecord): Promise<void> => {
    if (!meta.remoteId) {
      // Never synced — just delete locally
      await envelopePort.deleteNoteAndMeta(meta.date);
      await remoteDateIndex.deleteDate(meta.date);
      return;
    }

    const serverRev = expectedServerRevision(meta);

    const deleted = await gateway.deleteNote({
      id: meta.remoteId,
      date: meta.date,
      revision: serverRev,
    });

    if (deleted.ok) {
      await envelopePort.deleteNoteAndMeta(meta.date);
      await remoteDateIndex.deleteDate(meta.date);
      return;
    }

    if (deleted.error.type !== "Conflict") {
      throw deleted.error;
    }

    // Conflict on delete: fetch remote to see current state
    const remoteResult = await gateway.fetchNoteByDate(meta.date);
    const remote = unwrapOrThrow(remoteResult);

    if (!remote || remote.deleted) {
      // Remote already deleted or gone — clean up locally
      await envelopePort.deleteNoteAndMeta(meta.date);
      await remoteDateIndex.deleteDate(meta.date);
      return;
    }

    // Remote exists and not deleted — cancel our delete, accept remote content
    const now = clock.now().toISOString();
    await envelopePort.setNoteAndMeta(toLocalRecord(remote), toLocalMeta(remote, now));
  };

  const applyRemoteUpdate = async (remote: RemoteNote): Promise<void> => {
    const state = await envelopePort.getState(remote.date);
    const localRecord = state.record;
    const localMeta = state.meta;

    // Local delete pending — skip, will be pushed next
    if (localMeta?.pendingOp === "delete") {
      return;
    }

    // Already synced to this version, no local pending
    if (
      localMeta?.serverUpdatedAt === remote.serverUpdatedAt &&
      !localMeta?.pendingOp
    ) {
      return;
    }

    const now = clock.now().toISOString();

    if (remote.deleted) {
      if (localMeta?.pendingOp === "upsert" && localRecord) {
        // Local edit pending — keep local content, update server metadata only
        await envelopePort.setMeta({
          ...localMeta,
          remoteId: remote.id,
          serverRevision: remote.revision,
          serverUpdatedAt: remote.serverUpdatedAt,
        });
        return;
      }
      // No local pending — accept deletion
      await envelopePort.deleteNoteAndMeta(remote.date);
      await remoteDateIndex.deleteDate(remote.date);
      return;
    }

    if (localMeta?.pendingOp === "upsert" && localRecord) {
      // Local edit pending — keep local content, update server metadata only
      await envelopePort.setMeta({
        ...localMeta,
        remoteId: remote.id,
        serverRevision: remote.revision,
        serverUpdatedAt: remote.serverUpdatedAt,
      });
      return;
    }

    // No local pending — accept remote content
    await envelopePort.setNoteAndMeta(toLocalRecord(remote), toLocalMeta(remote, now));
  };

  const sync = async (): Promise<Result<SyncStatus, SyncError>> => {
    if (!connectivity.isOnline()) {
      return ok(SyncStatus.Offline);
    }

    try {
      const states = await envelopePort.getAllStates();

      // Push pending local changes
      for (const state of states) {
        const meta = state.meta;
        if (!meta?.pendingOp) continue;
        const record = state.record;

        if (meta.pendingOp === "delete") {
          await pushDelete(meta);
          continue;
        }

        if (!record) continue;
        await pushUpsert(record, meta);
      }

      await syncImages();

      // Pull remote updates
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

      return ok(SyncStatus.Synced);
    } catch (error) {
      const syncError = toUnknownSyncError(error);
      console.error("Sync error:", syncError);
      return err(syncError);
    }
  };

  const getLocalDates = async (year?: number): Promise<string[]> => {
    const states = await envelopePort.getAllStates();
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
    const nowMs = clock.now().getTime();
    // Deduplicate concurrent calls for the same year
    const existing = refreshDatesInFlight.get(year);
    if (existing) {
      return existing;
    }
    // Skip if we just completed a refresh recently
    const lastCompleted = refreshDatesLastCompleted.get(year);
    if (
      lastCompleted &&
      nowMs - lastCompleted < REFRESH_DATES_COOLDOWN_MS
    ) {
      return;
    }
    const promise = (async () => {
      try {
        const remoteDatesResult = await gateway.fetchNoteDates(year);
        const remoteDates = unwrapOrThrow(remoteDatesResult);
        await remoteDateIndex.setDatesForYear(year, remoteDates);
      } catch {
        return;
      } finally {
        refreshDatesInFlight.delete(year);
        refreshDatesLastCompleted.set(year, clock.now().getTime());
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
    const state = await envelopePort.getState(date);
    const record = state.record;
    const meta = state.meta;
    const envelope = record ? envelopePort.toEnvelope(record, meta) : null;
    return { record, meta, envelope };
  };

  return {
    async refreshEnvelope(date: string): Promise<NoteEnvelope | null> {
      if (!connectivity.isOnline()) {
        return null;
      }
      const snapshot = await getLocalSnapshot(date);
      try {
        const remoteResult = await gateway.fetchNoteByDate(date);
        if (!remoteResult.ok) {
          return snapshot.envelope;
        }
        const remote = remoteResult.value;
        const localRecord = snapshot.record;
        const localMeta = snapshot.meta;
        const now = clock.now().toISOString();

        if (localMeta?.pendingOp === "delete") {
          // Local delete pending — keep it, will push next sync
          return snapshot.envelope;
        }

        if (!remote || remote.deleted) {
          if (localMeta?.pendingOp === "upsert" && localRecord) {
            // Local edit pending — keep local, update server metadata
            const updatedMeta: NoteMetaRecord = {
              ...localMeta,
              remoteId: remote?.id ?? localMeta.remoteId,
              serverRevision: remote?.revision ?? localMeta.serverRevision,
              serverUpdatedAt:
                remote?.serverUpdatedAt ?? localMeta.serverUpdatedAt,
            };
            await envelopePort.setMeta(updatedMeta);
            return envelopePort.toEnvelope(localRecord, updatedMeta);
          }
          // No local edits — accept deletion
          if (localRecord) {
            await envelopePort.deleteNoteAndMeta(date);
            await remoteDateIndex.deleteDate(date);
          }
          return null;
        }

        if (!localRecord || !localMeta) {
          // No local — accept remote
          const record = toLocalRecord(remote);
          const metaRecord = toLocalMeta(remote, now);
          await envelopePort.setNoteAndMeta(record, metaRecord);
          return envelopePort.toEnvelope(record, metaRecord);
        }

        if (localMeta.pendingOp === "upsert") {
          // Local edit pending — keep local content, update server metadata
          const updatedMeta: NoteMetaRecord = {
            ...localMeta,
            remoteId: remote.id,
            serverRevision: remote.revision,
            serverUpdatedAt: remote.serverUpdatedAt,
          };
          await envelopePort.setMeta(updatedMeta);
          return envelopePort.toEnvelope(localRecord, updatedMeta);
        }

        // No local pending — accept remote content
        const record = toLocalRecord(remote);
        const metaRecord = toLocalMeta(remote, now);
        await envelopePort.setNoteAndMeta(record, metaRecord);
        return envelopePort.toEnvelope(record, metaRecord);
      } catch {
        return snapshot.envelope;
      }
    },
    async hasPendingOp(date: string): Promise<boolean> {
      const state = await envelopePort.getState(date);
      return Boolean(state.meta?.pendingOp);
    },
    async getAllDates(): Promise<string[]> {
      return await getLocalDates();
    },
    async getAllDatesForYear(year: number): Promise<string[]> {
      const localDates = await getLocalDates(year);
      try {
        const remoteDates = await remoteDateIndex.getDatesForYear(year);
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
      return await remoteDateIndex.hasDate(date);
    },
    sync,
  };
}
