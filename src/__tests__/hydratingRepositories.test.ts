import { createHydratingImageRepository } from "../domain/images/hydratingImageRepository";
import type { E2eeServiceFactory } from "../domain/crypto/e2eeService";
import { createE2eeService } from "../services/e2eeService";
import type { RemoteNotesGateway } from "../domain/sync/remoteNotesGateway";
import type { Clock } from "../domain/runtime/clock";
import type { Connectivity } from "../domain/runtime/connectivity";
import type { SyncStateStore } from "../domain/sync/syncStateStore";
import { createNoteSyncEngine } from "../domain/sync/noteSyncEngine";
import { closeUnifiedDb } from "../storage/unifiedDb";
import { getAllAccountDbNames } from "../storage/accountStore";
import { getNoteEnvelopeState, toNoteEnvelope } from "../storage/unifiedNoteEnvelopeRepository";
import { setNoteAndMeta } from "../storage/unifiedNoteStore";
import type { NoteMetaRecord, NoteRecord } from "../storage/unifiedDb";

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

async function createVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
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

describe("hydrating repositories", () => {
  beforeEach(async () => {
    await deleteUnifiedDb();
  });

  it("hydrates images from encrypted storage", async () => {
    const vaultKey = await createVaultKey();
    const e2eeFactory: E2eeServiceFactory = {
      create: createE2eeService,
    };
    const repository = createHydratingImageRepository(
      {
        activeKeyId: "key-1",
        getKey: () => vaultKey,
      },
      e2eeFactory,
    );
    const payload = new Uint8Array([10, 20, 30, 40]);
    const blob = new Blob([payload], { type: "image/png" });

    const metaResult = await repository.upload(
      "04-01-2025",
      blob,
      "inline",
      "test.png",
    );
    expect(metaResult.ok).toBe(true);
    if (!metaResult.ok) return;

    const storedResult = await repository.get(metaResult.value.id);
    expect(storedResult.ok).toBe(true);
    if (!storedResult.ok) return;

    expect(storedResult.value).not.toBeNull();
    const storedBytes = new Uint8Array(await blobToArrayBuffer(storedResult.value!));
    expect(Array.from(storedBytes)).toEqual(Array.from(payload));
  });

  it("stores note envelopes without decrypting", async () => {
    const gateway: RemoteNotesGateway = {
      fetchNoteByDate: jest.fn().mockResolvedValue({ ok: true, value: null }),
      fetchNoteDates: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      fetchNotesSince: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      pushNote: jest.fn().mockResolvedValue({
        ok: false,
        error: { type: "RemoteRejected", message: "not used" },
      }),
      deleteNote: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const connectivity: Connectivity = { isOnline: () => true };
    const clock: Clock = { now: () => new Date("2025-01-05T10:00:00.000Z") };
    const syncStateStore: SyncStateStore = {
      getState: jest
        .fn()
        .mockResolvedValue({ ok: true, value: { id: "state", cursor: null } }),
      setState: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const engine = createNoteSyncEngine(
      gateway,
      "key-1",
      async () => undefined,
      connectivity,
      clock,
      syncStateStore,
    );

    await saveEnvelope({
      date: "05-01-2025",
      ciphertext: "ciphertext",
      nonce: "nonce",
      keyId: "key-1",
      updatedAt: "2025-01-05T10:00:00.000Z",
    });

    const envelope = await getEnvelope("05-01-2025");
    expect(envelope).toEqual({
      date: "05-01-2025",
      ciphertext: "ciphertext",
      nonce: "nonce",
      keyId: "key-1",
      updatedAt: "2025-01-05T10:00:00.000Z",
      revision: 1,
      serverUpdatedAt: null,
      deleted: false,
    });

    const dates = await engine.getAllDates();
    expect(dates).toEqual(["05-01-2025"]);
  });
  it("refreshEnvelope keeps local content when pending upsert and no remote", async () => {
    const gateway: RemoteNotesGateway = {
      fetchNoteByDate: jest.fn().mockResolvedValue({ ok: true, value: null }),
      fetchNoteDates: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      fetchNotesSince: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      pushNote: jest.fn(),
      deleteNote: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const connectivity: Connectivity = { isOnline: () => true };
    const clock: Clock = { now: () => new Date("2025-01-05T10:00:00.000Z") };
    const syncStateStore: SyncStateStore = {
      getState: jest
        .fn()
        .mockResolvedValue({ ok: true, value: { id: "state", cursor: null } }),
      setState: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const engine = createNoteSyncEngine(
      gateway,
      "key-1",
      async () => undefined,
      connectivity,
      clock,
      syncStateStore,
    );

    // Save locally — creates pending upsert
    await saveEnvelope({
      date: "05-01-2025",
      ciphertext: "content-v1",
      nonce: "nonce-v1",
      keyId: "key-1",
      updatedAt: "2025-01-05T10:00:00.000Z",
    });

    // refreshEnvelope fetches remote (null) — should keep local content
    await engine.refreshEnvelope("05-01-2025");

    const envelope = await getEnvelope("05-01-2025");
    expect(envelope?.ciphertext).toBe("content-v1");
    expect(envelope?.nonce).toBe("nonce-v1");

    // pendingOp still set — push happens during sync, not refresh
    const hasPending = await engine.hasPendingOp("05-01-2025");
    expect(hasPending).toBe(true);

    // pushNote should NOT be called during refreshEnvelope
    expect(gateway.pushNote).not.toHaveBeenCalled();
  });

  it("preserves pending edits made during sync", async () => {
    let pushCallCount = 0;
    let saveEnvelopeDuringPush: (() => Promise<void>) | null = null;

    const gateway: RemoteNotesGateway = {
      fetchNoteByDate: jest.fn().mockResolvedValue({ ok: true, value: null }),
      fetchNoteDates: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      fetchNotesSince: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      pushNote: jest.fn().mockImplementation(async (note) => {
        pushCallCount++;
        // Simulate a concurrent edit happening during the push
        if (saveEnvelopeDuringPush) {
          await saveEnvelopeDuringPush();
          saveEnvelopeDuringPush = null;
        }
        return {
          ok: true,
          value: {
            id: "remote-id-1",
            date: note.date,
            ciphertext: note.ciphertext,
            nonce: note.nonce,
            keyId: note.keyId,
            revision: note.revision,
            updatedAt: note.updatedAt,
            serverUpdatedAt: `2025-01-05T10:00:0${pushCallCount}.000Z`,
            deleted: false,
          },
        };
      }),
      deleteNote: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const connectivity: Connectivity = { isOnline: () => true };
    const clock: Clock = { now: () => new Date("2025-01-05T10:00:00.000Z") };
    const syncStateStore: SyncStateStore = {
      getState: jest
        .fn()
        .mockResolvedValue({ ok: true, value: { id: "state", cursor: null } }),
      setState: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const engine = createNoteSyncEngine(
      gateway,
      "key-1",
      async () => undefined,
      connectivity,
      clock,
      syncStateStore,
    );

    // Initial save
    await saveEnvelope({
      date: "05-01-2025",
      ciphertext: "content-v1",
      nonce: "nonce-v1",
      keyId: "key-1",
      updatedAt: "2025-01-05T10:00:00.000Z",
    });

    // Set up a concurrent edit to happen during the first sync's push
    saveEnvelopeDuringPush = async () => {
      await saveEnvelope({
        date: "05-01-2025",
        ciphertext: "content-v2",
        nonce: "nonce-v2",
        keyId: "key-1",
        updatedAt: "2025-01-05T10:00:01.000Z",
      });
    };

    // Run first sync - this will push v1, but during the push, v2 is saved
    await engine.sync();

    // The envelope should have v2 content (the edit made during sync)
    const envelope = await getEnvelope("05-01-2025");
    expect(envelope?.ciphertext).toBe("content-v2");
    expect(envelope?.nonce).toBe("nonce-v2");

    // The serverUpdatedAt should be updated from the push response
    expect(envelope?.serverUpdatedAt).toBe("2025-01-05T10:00:01.000Z");

    // There should still be a pending op since v2 hasn't been synced yet
    const hasPending = await engine.hasPendingOp("05-01-2025");
    expect(hasPending).toBe(true);

    // Run second sync to push v2
    await engine.sync();

    // Now v2 should be synced and no more pending ops
    const hasPendingAfter = await engine.hasPendingOp("05-01-2025");
    expect(hasPendingAfter).toBe(false);

    // Push should have been called twice (once for v1, once for v2)
    expect(pushCallCount).toBe(2);
  });
});

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("Unexpected FileReader result"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
