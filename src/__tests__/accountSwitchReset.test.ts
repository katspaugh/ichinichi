import { createHydratingNoteRepository } from "../domain/notes/hydratingNoteRepository";
import { createUnifiedSyncedNoteEnvelopeRepository } from "../storage/unifiedSyncedNoteRepository";
import { createE2eeService } from "../services/e2eeService";
import { closeUnifiedDb } from "../storage/unifiedDb";
import { getAllAccountDbNames } from "../storage/accountStore";
import type { Clock } from "../domain/runtime/clock";
import type { Connectivity } from "../domain/runtime/connectivity";
import type { SyncStateStore } from "../domain/sync/syncStateStore";
import type { RemoteNotesGateway } from "../domain/sync/remoteNotesGateway";
import type { E2eeServiceFactory } from "../domain/crypto/e2eeService";
import type { KeyringProvider } from "../domain/crypto/keyring";
import { handleCloudAccountSwitch } from "../storage/accountSwitch";
import { getCurrentAccountId } from "../storage/accountStore";

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

function createKeyring(keyId: string, vaultKey: CryptoKey): KeyringProvider {
  return {
    activeKeyId: keyId,
    getKey: (id: string) => (id === keyId ? vaultKey : null),
  };
}

describe("account switch resets cloud sync state", () => {
  beforeEach(async () => {
    await deleteUnifiedDb();
    localStorage.clear();
  });

  it("switches to a new local account for a different user", async () => {
    const vaultKey = await createVaultKey();
    const keyId = "local-key-1";
    const keyring = createKeyring(keyId, vaultKey);
    const e2eeFactory: E2eeServiceFactory = { create: createE2eeService };

    const localRepository = createHydratingNoteRepository(keyring, e2eeFactory);
    await localRepository.save("05-01-2026", "Local only note");

    await handleCloudAccountSwitch("user-a");
    const accountAfterFirst = getCurrentAccountId();

    await handleCloudAccountSwitch("user-b");
    const accountAfterSecond = getCurrentAccountId();

    expect(accountAfterFirst).toBe("1");
    expect(accountAfterSecond).not.toBe(accountAfterFirst);

    const gateway: RemoteNotesGateway = {
      fetchNoteByDate: jest.fn().mockResolvedValue({ ok: true, value: null }),
      fetchNoteDates: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      fetchNotesSince: jest.fn().mockResolvedValue({ ok: true, value: [] }),
      pushNote: jest.fn(),
      deleteNote: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const connectivity: Connectivity = { isOnline: () => true };
    const clock: Clock = { now: () => new Date("2026-02-02T10:00:00.000Z") };
    const syncStateStore: SyncStateStore = {
      getState: jest.fn().mockResolvedValue({
        ok: true,
        value: { id: "state", cursor: null },
      }),
      setState: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    };

    const envelopeRepo = createUnifiedSyncedNoteEnvelopeRepository(
      gateway,
      "cloud-key-1",
      async () => undefined,
      connectivity,
      clock,
      syncStateStore,
    );

    await envelopeRepo.sync();
    expect(gateway.pushNote).not.toHaveBeenCalled();
  });
});
