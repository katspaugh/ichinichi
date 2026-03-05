import { createNoteSyncEngine } from "../domain/sync/noteSyncEngine";
import { createNoteEnvelopeAdapter } from "../storage/noteEnvelopeAdapter";
import { createRemoteDateIndexAdapter } from "../storage/remoteDateIndexAdapter";
import { closeUnifiedDb } from "../storage/unifiedDb";
import { getAllAccountDbNames } from "../storage/accountStore";
import { getNoteEnvelopeState, toNoteEnvelope } from "../storage/unifiedNoteEnvelopeRepository";
import { setNoteAndMeta, setNoteMeta, deleteNoteRecord } from "../storage/unifiedNoteStore";
import { deleteRemoteDate } from "../storage/remoteNoteIndexStore";
import type { NoteMetaRecord, NoteRecord } from "../storage/unifiedDb";
import type { RemoteNotesGateway } from "../domain/sync/remoteNotesGateway";
import type { Clock } from "../domain/runtime/clock";
import type { Connectivity } from "../domain/runtime/connectivity";
import type { SyncStateStore } from "../domain/sync/syncStateStore";

async function deleteUnifiedDb(): Promise<void> {
  closeUnifiedDb();
  const dbNames = getAllAccountDbNames();
  await Promise.all(
    dbNames.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => resolve();
        }),
    ),
  );
}

// Storage helpers matching the old envelope repo API
async function saveEnvelope(payload: {
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
    serverRevision: existingMeta?.serverRevision,
    remoteId: existingMeta?.remoteId ?? null,
    serverUpdatedAt: existingMeta?.serverUpdatedAt ?? null,
    lastSyncedAt: existingMeta?.lastSyncedAt ?? null,
    pendingOp: "upsert",
  };
  await setNoteAndMeta(record, meta);
}

async function getEnvelope(date: string) {
  const state = await getNoteEnvelopeState(date);
  if (!state.record) return null;
  return toNoteEnvelope(state.record, state.meta);
}

async function deleteEnvelope(date: string): Promise<void> {
  const existingMeta = (await getNoteEnvelopeState(date)).meta;
  const meta: NoteMetaRecord = {
    date,
    revision: (existingMeta?.revision ?? 0) + 1,
    serverRevision: existingMeta?.serverRevision,
    remoteId: existingMeta?.remoteId ?? null,
    serverUpdatedAt: existingMeta?.serverUpdatedAt ?? null,
    lastSyncedAt: existingMeta?.lastSyncedAt ?? null,
    pendingOp: "delete",
  };
  await setNoteMeta(meta);
  await deleteNoteRecord(date);
  await deleteRemoteDate(date);
}

function makeRemoteNote(overrides: Partial<{
  id: string;
  date: string;
  ciphertext: string;
  nonce: string;
  keyId: string;
  revision: number;
  updatedAt: string;
  serverUpdatedAt: string;
  deleted: boolean;
}> = {}) {
  return {
    id: "remote-1",
    date: "10-01-2026",
    ciphertext: "remote",
    nonce: "nonce-remote",
    keyId: "key-1",
    revision: 1,
    updatedAt: "2026-01-10T10:00:00.000Z",
    serverUpdatedAt: "2026-01-10T10:00:00.000Z",
    deleted: false,
    ...overrides,
  };
}

function makeGateway(overrides: Partial<RemoteNotesGateway> = {}): RemoteNotesGateway {
  return {
    fetchNoteByDate: jest.fn().mockResolvedValue({ ok: true, value: null }),
    fetchNoteDates: jest.fn().mockResolvedValue({ ok: true, value: [] }),
    fetchNotesSince: jest.fn().mockResolvedValue({ ok: true, value: [] }),
    pushNote: jest.fn().mockResolvedValue({
      ok: true,
      value: makeRemoteNote({ revision: 1 }),
    }),
    deleteNote: jest.fn().mockResolvedValue({
      ok: true,
      value: makeRemoteNote({ deleted: true, revision: 2 }),
    }),
    ...overrides,
  };
}

function makeDeps() {
  const connectivity: Connectivity = { isOnline: () => true };
  const clock: Clock = { now: () => new Date("2026-01-10T12:00:00.000Z") };
  const syncStateStore: SyncStateStore = {
    getState: jest.fn().mockResolvedValue({
      ok: true,
      value: { id: "state", cursor: null },
    }),
    setState: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
  };
  return { connectivity, clock, syncStateStore };
}

describe("noteSyncEngine", () => {
  beforeEach(async () => {
    await deleteUnifiedDb();
  });

  describe("push with version gating", () => {
    it("pushes new note with revision 0 (server assigns 1)", async () => {
      const gateway = makeGateway({
        pushNote: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ ciphertext: "local", revision: 1 }),
        }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local",
        nonce: "nonce-local",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });

      await engine.sync();

      // Should push with revision 0 (no serverRevision, no remoteId)
      expect(gateway.pushNote).toHaveBeenCalledWith(
        expect.objectContaining({ revision: 0 }),
      );

      const envelope = await getEnvelope("10-01-2026");
      expect(envelope?.revision).toBe(1);
    });

    it("retries on VERSION_CONFLICT by fetching remote and pushing with updated revision", async () => {
      let pushCount = 0;
      const gateway = makeGateway({
        fetchNoteByDate: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ revision: 3 }),
        }),
        pushNote: jest.fn().mockImplementation(async () => {
          pushCount += 1;
          if (pushCount === 1) {
            return { ok: false, error: { type: "Conflict", message: "VERSION_CONFLICT" } };
          }
          return {
            ok: true,
            value: makeRemoteNote({ ciphertext: "local", revision: 4 }),
          };
        }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local",
        nonce: "nonce-local",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });

      await engine.sync();

      expect(pushCount).toBe(2);
      // Second push should use the remote's revision (3)
      expect(gateway.pushNote).toHaveBeenLastCalledWith(
        expect.objectContaining({ revision: 3, id: "remote-1" }),
      );

      const envelope = await getEnvelope("10-01-2026");
      expect(envelope?.revision).toBe(4);
    });

    it("leaves pendingOp if retry also fails", async () => {
      const gateway = makeGateway({
        fetchNoteByDate: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ revision: 3 }),
        }),
        pushNote: jest.fn().mockResolvedValue({
          ok: false,
          error: { type: "Conflict", message: "VERSION_CONFLICT" },
        }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local",
        nonce: "nonce-local",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });

      await engine.sync();

      // pendingOp should still be set for next cycle
      expect(await engine.hasPendingOp("10-01-2026")).toBe(true);
    });
  });

  describe("delete with version gating", () => {
    it("deletes with server revision check", async () => {
      const gateway = makeGateway({
        pushNote: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ revision: 1 }),
        }),
        deleteNote: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ deleted: true, revision: 2 }),
        }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      // Save + sync to establish server link
      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local",
        nonce: "nonce-local",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });
      await engine.sync();

      // Delete + sync
      await deleteEnvelope("10-01-2026");
      await engine.sync();

      expect(gateway.deleteNote).toHaveBeenCalledWith(
        expect.objectContaining({ id: "remote-1", revision: 1 }),
      );

      const envelope = await getEnvelope("10-01-2026");
      expect(envelope).toBeNull();
    });

    it("skips remote delete for never-synced notes", async () => {
      const gateway = makeGateway();
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local",
        nonce: "nonce-local",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });

      // Delete before ever syncing
      await deleteEnvelope("10-01-2026");
      await engine.sync();

      expect(gateway.deleteNote).not.toHaveBeenCalled();
      const envelope = await getEnvelope("10-01-2026");
      expect(envelope).toBeNull();
    });

    it("cancels local delete if remote has new content on conflict", async () => {
      const remoteNote = makeRemoteNote({ ciphertext: "remote-new", revision: 5 });
      const gateway = makeGateway({
        pushNote: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ revision: 1 }),
        }),
        deleteNote: jest.fn().mockResolvedValue({
          ok: false,
          error: { type: "Conflict", message: "VERSION_CONFLICT" },
        }),
        fetchNoteByDate: jest.fn().mockResolvedValue({
          ok: true,
          value: remoteNote,
        }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      // Save + sync to establish link
      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local",
        nonce: "nonce-local",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });
      await engine.sync();

      // Delete
      await deleteEnvelope("10-01-2026");
      await engine.sync();

      // Should accept remote content instead of deleting
      const envelope = await getEnvelope("10-01-2026");
      expect(envelope?.ciphertext).toBe("remote-new");
    });
  });

  describe("pull (applyRemoteUpdate)", () => {
    it("skips remote update when local delete is pending", async () => {
      const gateway = makeGateway({
        pushNote: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ revision: 1 }),
        }),
        deleteNote: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ deleted: true, revision: 2 }),
        }),
        fetchNotesSince: jest.fn().mockResolvedValue({
          ok: true,
          value: [makeRemoteNote({ revision: 3, ciphertext: "remote-updated" })],
        }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      // Save + sync to establish link, then delete locally
      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local",
        nonce: "nonce-local",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });
      await engine.sync();
      await deleteEnvelope("10-01-2026");

      // Sync again — should push delete, not accept remote update
      await engine.sync();
      expect(gateway.deleteNote).toHaveBeenCalled();
    });

    it("keeps local content when remote deleted but local has pending upsert", async () => {
      // Push always conflicts so pendingOp stays "upsert" through pull phase
      const gateway = makeGateway({
        pushNote: jest.fn().mockResolvedValue({
          ok: false,
          error: { type: "Conflict", message: "VERSION_CONFLICT" },
        }),
        fetchNoteByDate: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ deleted: true, revision: 2 }),
        }),
        fetchNotesSince: jest.fn().mockResolvedValue({
          ok: true,
          value: [makeRemoteNote({ deleted: true, revision: 2 })],
        }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local-edit",
        nonce: "nonce-local",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });

      // Push conflicts (pendingOp stays), pull sees deleted remote → keeps local
      await engine.sync();

      const envelope = await getEnvelope("10-01-2026");
      expect(envelope?.ciphertext).toBe("local-edit");
    });

    it("accepts remote content when no local pending", async () => {
      const gateway = makeGateway({
        fetchNotesSince: jest.fn().mockResolvedValue({
          ok: true,
          value: [makeRemoteNote({ ciphertext: "from-server", revision: 5 })],
        }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      await engine.sync();

      const envelope = await getEnvelope("10-01-2026");
      expect(envelope?.ciphertext).toBe("from-server");
      expect(envelope?.revision).toBe(5);
    });

    it("keeps local content on remote update when local upsert is pending", async () => {
      let pushCount = 0;
      const gateway = makeGateway({
        pushNote: jest.fn().mockImplementation(async () => {
          pushCount++;
          if (pushCount === 1) {
            // First push succeeds (initial sync)
            return {
              ok: true,
              value: makeRemoteNote({ ciphertext: "local", revision: 1 }),
            };
          }
          // Second push conflicts — pendingOp stays "upsert" during pull
          return {
            ok: false,
            error: { type: "Conflict", message: "VERSION_CONFLICT" },
          };
        }),
        fetchNoteByDate: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ ciphertext: "remote-v2", revision: 2 }),
        }),
        fetchNotesSince: jest
          .fn()
          .mockResolvedValueOnce({ ok: true, value: [] })
          .mockResolvedValueOnce({
            ok: true,
            value: [makeRemoteNote({ ciphertext: "remote-v2", revision: 2, serverUpdatedAt: "2026-01-10T11:00:00.000Z" })],
          }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      // Save + sync to establish link
      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local",
        nonce: "nonce-local",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });
      await engine.sync();

      // Make a new local edit, then sync again
      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local-v2",
        nonce: "nonce-local-2",
        keyId: "key-1",
        updatedAt: "2026-01-10T13:00:00.000Z",
      });

      // Second sync: push conflicts (pendingOp stays), pull has remote-v2
      await engine.sync();

      const envelope = await getEnvelope("10-01-2026");
      // Local content preserved (pending upsert takes priority over remote pull)
      expect(envelope?.ciphertext).toBe("local-v2");
    });
  });

  describe("refreshEnvelope", () => {
    it("accepts remote content when no local pending", async () => {
      const gateway = makeGateway({
        fetchNoteByDate: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ ciphertext: "from-server", revision: 3 }),
        }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      const envelope = await engine.refreshEnvelope("10-01-2026");
      expect(envelope?.ciphertext).toBe("from-server");
      expect(envelope?.revision).toBe(3);
    });

    it("keeps local content when pending upsert exists", async () => {
      const gateway = makeGateway({
        fetchNoteByDate: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ ciphertext: "remote-v5", revision: 5 }),
        }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local-edit",
        nonce: "nonce-local",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });

      const envelope = await engine.refreshEnvelope("10-01-2026");
      expect(envelope?.ciphertext).toBe("local-edit");
    });

    it("deletes locally when remote deleted and no local pending", async () => {
      const gateway = makeGateway({
        pushNote: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ revision: 1 }),
        }),
        fetchNoteByDate: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ deleted: true, revision: 2 }),
        }),
        fetchNotesSince: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      // Save + sync to establish link (no pending after sync)
      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "local",
        nonce: "nonce-local",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });
      await engine.sync();

      // Refresh finds remote deleted
      const envelope = await engine.refreshEnvelope("10-01-2026");
      expect(envelope).toBeNull();
    });
  });

  describe("serverRevision tracking", () => {
    it("preserves serverRevision across local saves", async () => {
      const gateway = makeGateway({
        pushNote: jest.fn().mockResolvedValue({
          ok: true,
          value: makeRemoteNote({ revision: 1 }),
        }),
        fetchNotesSince: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      });
      const { connectivity, clock, syncStateStore } = makeDeps();

      const engine = createNoteSyncEngine(
        gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
        createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
      );

      // Save + sync → serverRevision = 1
      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "v1",
        nonce: "nonce-1",
        keyId: "key-1",
        updatedAt: "2026-01-10T12:00:00.000Z",
      });
      await engine.sync();

      // Local edit → should push with serverRevision 1 on next sync
      await saveEnvelope({
        date: "10-01-2026",
        ciphertext: "v2",
        nonce: "nonce-2",
        keyId: "key-1",
        updatedAt: "2026-01-10T13:00:00.000Z",
      });

      // Reset mock to capture next push call
      (gateway.pushNote as jest.Mock).mockResolvedValue({
        ok: true,
        value: makeRemoteNote({ ciphertext: "v2", revision: 2 }),
      });

      await engine.sync();

      // Second push should use serverRevision 1 (not local revision)
      expect(gateway.pushNote).toHaveBeenLastCalledWith(
        expect.objectContaining({ revision: 1 }),
      );
    });
  });

  it("deduplicates refreshDates calls", async () => {
    const gateway = makeGateway();
    const { connectivity, clock, syncStateStore } = makeDeps();

    const engine = createNoteSyncEngine(
      gateway, "key-1", async () => undefined, connectivity, clock, syncStateStore,
      createNoteEnvelopeAdapter(), createRemoteDateIndexAdapter(),
    );

    await Promise.all([
      engine.refreshDates(2026),
      engine.refreshDates(2026),
    ]);

    expect(gateway.fetchNoteDates).toHaveBeenCalledTimes(1);
  });

  it("does not share refreshDates cooldown across engine instances", async () => {
    const firstGateway = makeGateway();
    const secondGateway = makeGateway();
    const { connectivity, clock, syncStateStore } = makeDeps();

    const firstEngine = createNoteSyncEngine(
      firstGateway,
      "key-1",
      async () => undefined,
      connectivity,
      clock,
      syncStateStore,
      createNoteEnvelopeAdapter(),
      createRemoteDateIndexAdapter(),
    );
    const secondEngine = createNoteSyncEngine(
      secondGateway,
      "key-1",
      async () => undefined,
      connectivity,
      clock,
      syncStateStore,
      createNoteEnvelopeAdapter(),
      createRemoteDateIndexAdapter(),
    );

    await firstEngine.refreshDates(2026);
    await secondEngine.refreshDates(2026);

    expect(firstGateway.fetchNoteDates).toHaveBeenCalledTimes(1);
    expect(secondGateway.fetchNoteDates).toHaveBeenCalledTimes(1);
  });
});
