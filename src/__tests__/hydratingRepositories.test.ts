import { createHydratingImageRepository } from "../domain/images/hydratingImageRepository";
import type { E2eeServiceFactory } from "../domain/crypto/e2eeService";
import { createE2eeService } from "../services/e2eeService";
import type { RemoteNotesGateway } from "../domain/sync/remoteNotesGateway";
import type { Clock } from "../domain/runtime/clock";
import type { Connectivity } from "../domain/runtime/connectivity";
import type { SyncStateStore } from "../domain/sync/syncStateStore";
import { createUnifiedSyncedNoteEnvelopeRepository } from "../storage/unifiedSyncedNoteRepository";
import { closeUnifiedDb } from "../storage/unifiedDb";

async function deleteUnifiedDb(): Promise<void> {
  closeUnifiedDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("dailynotes-unified");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function createVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
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
    const repository = createHydratingImageRepository({
      activeKeyId: "key-1",
      getKey: () => vaultKey,
    }, e2eeFactory);
    const payload = new Uint8Array([10, 20, 30, 40]);
    const blob = new Blob([payload], { type: "image/png" });

    const meta = await repository.upload(
      "04-01-2025",
      blob,
      "inline",
      "test.png",
    );
    const stored = await repository.get(meta.id);

    expect(stored).not.toBeNull();
    const storedBytes = new Uint8Array(await blobToArrayBuffer(stored!));
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
      getState: jest.fn().mockResolvedValue({ ok: true, value: { id: "state", cursor: null } }),
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
      date: "05-01-2025",
      ciphertext: "ciphertext",
      nonce: "nonce",
      keyId: "key-1",
      updatedAt: "2025-01-05T10:00:00.000Z",
    });

    const envelope = await repository.getEnvelope("05-01-2025");
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

    const dates = await repository.getAllDates();
    expect(dates).toEqual(["05-01-2025"]);
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
