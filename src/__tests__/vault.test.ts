import {
  createVault,
  unlockWithPassword,
  updatePasswordWrappedKey,
  tryUnlockWithDeviceKey,
  closeVaultDb,
} from "../storage/vault";

async function clearVaultDb(): Promise<void> {
  closeVaultDb();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("dailynotes-vault");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function exportKeyBytes(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

describe("vault lifecycle", () => {
  jest.setTimeout(20000);
  beforeEach(async () => {
    localStorage.clear();
    await clearVaultDb();
  });

  it("creates and unlocks a vault with the same key", async () => {
    const vaultKey = await createVault("hunter2", { kdfIterations: 1000 });
    const unlocked = await unlockWithPassword("hunter2");

    const [originalBytes, unlockedBytes] = await Promise.all([
      exportKeyBytes(vaultKey),
      exportKeyBytes(unlocked),
    ]);

    expect(Array.from(unlockedBytes)).toEqual(Array.from(originalBytes));
  });

  it("rotates the password wrap and invalidates the old password", async () => {
    const vaultKey = await createVault("old-password", { kdfIterations: 1000 });
    await updatePasswordWrappedKey(vaultKey, "new-password", {
      kdfIterations: 1000,
    });

    const unlocked = await unlockWithPassword("new-password");
    const [originalBytes, unlockedBytes] = await Promise.all([
      exportKeyBytes(vaultKey),
      exportKeyBytes(unlocked),
    ]);
    expect(Array.from(unlockedBytes)).toEqual(Array.from(originalBytes));

    await expect(unlockWithPassword("old-password")).rejects.toThrow();
  });

  it("unlocks via the device key when available", async () => {
    const vaultKey = await createVault("device-pass", { kdfIterations: 1000 });
    const unlocked = await tryUnlockWithDeviceKey();

    if (!unlocked) {
      expect(unlocked).toBeNull();
      return;
    }

    const [originalBytes, unlockedBytes] = await Promise.all([
      exportKeyBytes(vaultKey),
      exportKeyBytes(unlocked),
    ]);

    expect(Array.from(unlockedBytes)).toEqual(Array.from(originalBytes));
  });
});
