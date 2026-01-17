import { createUnifiedSyncedNoteEnvelopeRepository } from "../storage/unifiedSyncedNoteRepository";
import { closeUnifiedDb } from "../storage/unifiedDb";
import type { RemoteNotesGateway } from "../domain/sync/remoteNotesGateway";
import type { Clock } from "../domain/runtime/clock";
import type { Connectivity } from "../domain/runtime/connectivity";
import type { SyncStateStore } from "../domain/sync/syncStateStore";

async function deleteUnifiedDb(): Promise<void> {
  closeUnifiedDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("dailynotes-unified");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("unifiedSyncedNoteRepository", () => {
  beforeEach(async () => {
    await deleteUnifiedDb();
  });

  it("retries remote conflict by rebasing local revisions", async () => {
    let pushCount = 0;

    const gateway: RemoteNotesGateway = {
      fetchNoteByDate: jest.fn().mockResolvedValue({
        ok: true,
        value: {
          id: "remote-1",
          date: "10-01-2026",
          ciphertext: "remote",
          nonce: "nonce-remote",
          keyId: "key-1",
          revision: 1,
          updatedAt: "2026-01-10T10:00:00.000Z",
          serverUpdatedAt: "2026-01-10T10:00:00.000Z",
          deleted: false,
        },
      }),
      fetchNoteDates: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      fetchNotesSince: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      pushNote: jest.fn().mockImplementation(async () => {
        pushCount += 1;
        if (pushCount === 1) {
          return {
            ok: false,
            error: { type: "Conflict", message: "conflict" },
          };
        }
        return {
          ok: true,
          value: {
            id: "remote-1",
            date: "10-01-2026",
            ciphertext: "local",
            nonce: "nonce-local",
            keyId: "key-1",
            revision: 2,
            updatedAt: "2026-01-10T12:00:00.000Z",
            serverUpdatedAt: "2026-01-10T12:00:00.000Z",
            deleted: false,
          },
        };
      }),
      deleteNote: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const connectivity: Connectivity = { isOnline: () => true };
    const clock: Clock = { now: () => new Date("2026-01-10T12:00:00.000Z") };
    const syncStateStore: SyncStateStore = {
      getState: jest.fn().mockResolvedValue({
        ok: true,
        value: { id: "state", cursor: null },
      }),
      setState: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };

    const repository = createUnifiedSyncedNoteEnvelopeRepository(
      gateway,
      "key-1",
      async () => undefined,
      connectivity,
      clock,
      syncStateStore,
    );

    await repository.saveEnvelope({
      date: "10-01-2026",
      ciphertext: "local",
      nonce: "nonce-local",
      keyId: "key-1",
      updatedAt: "2026-01-10T12:00:00.000Z",
    });

    await repository.sync();

    const envelope = await repository.getEnvelope("10-01-2026");
    expect(envelope?.revision).toBe(2);
    expect(pushCount).toBe(2);
  });

  it("deduplicates refreshDates calls", async () => {
    const gateway: RemoteNotesGateway = {
      fetchNoteByDate: jest.fn().mockResolvedValue({ ok: true, value: null }),
      fetchNoteDates: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      fetchNotesSince: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      pushNote: jest.fn().mockResolvedValue({
        ok: true,
        value: {
          id: "remote-1",
          date: "10-01-2026",
          ciphertext: "local",
          nonce: "nonce-local",
          keyId: "key-1",
          revision: 1,
          updatedAt: "2026-01-10T12:00:00.000Z",
          serverUpdatedAt: "2026-01-10T12:00:00.000Z",
          deleted: false,
        },
      }),
      deleteNote: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const connectivity: Connectivity = { isOnline: () => true };
    const clock: Clock = { now: () => new Date("2026-01-10T12:00:00.000Z") };
    const syncStateStore: SyncStateStore = {
      getState: jest.fn().mockResolvedValue({
        ok: true,
        value: { id: "state", cursor: null },
      }),
      setState: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };

    const repository = createUnifiedSyncedNoteEnvelopeRepository(
      gateway,
      "key-1",
      async () => undefined,
      connectivity,
      clock,
      syncStateStore,
    );

    await Promise.all([
      repository.refreshDates(2026),
      repository.refreshDates(2026),
    ]);

    expect(gateway.fetchNoteDates).toHaveBeenCalledTimes(1);
  });
});
