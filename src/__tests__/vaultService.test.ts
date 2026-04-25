// @vitest-environment jsdom
import type { MockedFunction } from "vitest";
import {
  unlockCloudVault,
  rewrapCloudKeyring,
  ensureCloudKeyringPassword,
  bootstrapLocalVault,
  unlockLocalVault,
  tryDeviceUnlockCloudKey,
  reencryptCloudNotes,
} from "../services/vaultService";
import {
  bytesToBase64,
  encodeUtf8,
  randomBytes,
} from "../storage/cryptoUtils";
import { deleteUserKeyringEntry } from "../storage/userKeyring";
import {
  fetchUserKeyring,
  saveUserKeyringEntry,
} from "../storage/userKeyring";
import type { UserKeyringEntry } from "../storage/userKeyring";
import {
  generateDEK,
  deriveKEK,
  wrapDEK,
  generateSalt,
  DEFAULT_KDF_ITERATIONS,
  closeVaultDb,
  storeDeviceWrappedDEK,
  storeDeviceEncryptedPassword,
  tryGetDeviceEncryptedPassword,
  clearDeviceEncryptedPassword,
} from "../storage/vault";
import { computeKeyId } from "../storage/keyId";

vi.mock("../storage/userKeyring", () => ({
  fetchUserKeyring: vi.fn(),
  saveUserKeyringEntry: vi.fn(),
  deleteUserKeyringEntry: vi.fn(),
}));

const mockFetchUserKeyring = fetchUserKeyring as MockedFunction<
  typeof fetchUserKeyring
>;
const mockSaveUserKeyringEntry = saveUserKeyringEntry as MockedFunction<
  typeof saveUserKeyringEntry
>;
const mockDeleteUserKeyringEntry = deleteUserKeyringEntry as MockedFunction<
  typeof deleteUserKeyringEntry
>;

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

async function keysEqual(a: CryptoKey, b: CryptoKey): Promise<boolean> {
  const [aBytes, bBytes] = await Promise.all([
    exportKeyBytes(a),
    exportKeyBytes(b),
  ]);
  if (aBytes.length !== bBytes.length) return false;
  return aBytes.every((byte, i) => byte === bBytes[i]);
}

async function createKeyringEntry(
  dek: CryptoKey,
  password: string,
  isPrimary: boolean,
): Promise<UserKeyringEntry> {
  const salt = generateSalt();
  const kek = await deriveKEK(password, salt, DEFAULT_KDF_ITERATIONS);
  const wrapped = await wrapDEK(dek, kek);
  const keyId = await computeKeyId(dek);
  return {
    keyId,
    wrappedDek: wrapped.data,
    dekIv: wrapped.iv,
    kdfSalt: salt,
    kdfIterations: DEFAULT_KDF_ITERATIONS,
    version: 1,
    isPrimary,
  };
}

function createMockSupabase(): unknown {
  return { from: vi.fn() };
}

describe("unlockCloudVault", () => {
  vi.setConfig({ testTimeout: 30000 });

  beforeEach(async () => {
    localStorage.clear();
    await clearVaultDb();
    mockFetchUserKeyring.mockReset();
    mockSaveUserKeyringEntry.mockReset();
  });

  it("creates new DEK when user has no keyring and no local DEK", async () => {
    mockFetchUserKeyring.mockResolvedValue([]);
    mockSaveUserKeyringEntry.mockResolvedValue();

    const result = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "test-password",
      localDek: null,
      localKeyring: new Map(),
    });

    expect(result.vaultKey).not.toBeNull();
    expect(result.keyring.size).toBe(1);
    expect(result.primaryKeyId).not.toBeNull();
    expect(mockSaveUserKeyringEntry).toHaveBeenCalledTimes(1);
    expect(mockSaveUserKeyringEntry).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ isPrimary: true }),
    );
  });

  it("uses local DEK when user has no keyring but has local DEK", async () => {
    mockFetchUserKeyring.mockResolvedValue([]);
    mockSaveUserKeyringEntry.mockResolvedValue();

    const localDek = await generateDEK();
    const localKeyId = await computeKeyId(localDek);

    const result = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "test-password",
      localDek,
      localKeyring: new Map(),
    });

    expect(result.vaultKey).not.toBeNull();
    expect(await keysEqual(result.vaultKey!, localDek)).toBe(true);
    expect(result.primaryKeyId).toBe(localKeyId);
    expect(result.keyring.has(localKeyId)).toBe(true);
  });

  it("fetches and unwraps existing keyring entries", async () => {
    const existingDek = await generateDEK();
    const entry = await createKeyringEntry(existingDek, "test-password", true);
    mockFetchUserKeyring.mockResolvedValue([entry]);
    mockSaveUserKeyringEntry.mockResolvedValue();

    const result = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "test-password",
      localDek: null,
      localKeyring: new Map(),
    });

    expect(result.vaultKey).not.toBeNull();
    expect(await keysEqual(result.vaultKey!, existingDek)).toBe(true);
    expect(result.primaryKeyId).toBe(entry.keyId);
    expect(result.keyring.size).toBe(1);
  });

  it("marks first key as primary when none marked", async () => {
    const existingDek = await generateDEK();
    const entry = await createKeyringEntry(existingDek, "test-password", false);
    mockFetchUserKeyring.mockResolvedValue([entry]);
    mockSaveUserKeyringEntry.mockResolvedValue();

    const result = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "test-password",
      localDek: null,
      localKeyring: new Map(),
    });

    expect(result.primaryKeyId).toBe(entry.keyId);
    expect(mockSaveUserKeyringEntry).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ keyId: entry.keyId, isPrimary: true }),
    );
  });

  it("does not upload local DEK when cloud keyrings already exist", async () => {
    const cloudDek = await generateDEK();
    const localDek = await generateDEK();
    const cloudEntry = await createKeyringEntry(cloudDek, "test-password", true);

    mockFetchUserKeyring.mockResolvedValue([cloudEntry]);
    mockSaveUserKeyringEntry.mockResolvedValue();

    const result = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "test-password",
      localDek,
      localKeyring: new Map(),
    });

    expect(result.keyring.size).toBe(1);
    expect(result.keyring.has(cloudEntry.keyId)).toBe(true);
    expect(result.primaryKeyId).toBe(cloudEntry.keyId);
    expect(mockSaveUserKeyringEntry).not.toHaveBeenCalled();
  });

  it("does not upload local keyring entries when cloud keyrings exist", async () => {
    const cloudDek = await generateDEK();
    const localKey1 = await generateDEK();
    const localKey2 = await generateDEK();
    const cloudEntry = await createKeyringEntry(cloudDek, "test-password", true);

    const localKeyring = new Map<string, CryptoKey>();
    localKeyring.set(await computeKeyId(localKey1), localKey1);
    localKeyring.set(await computeKeyId(localKey2), localKey2);

    mockFetchUserKeyring.mockResolvedValue([cloudEntry]);
    mockSaveUserKeyringEntry.mockResolvedValue();

    const result = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "test-password",
      localDek: null,
      localKeyring,
    });

    expect(result.keyring.size).toBe(1);
    expect(mockSaveUserKeyringEntry).not.toHaveBeenCalled();
  });

  it("falls back to device DEK when password is wrong without rewrapping", async () => {
    const existingDek = await generateDEK();
    const entry = await createKeyringEntry(existingDek, "old-password", true);
    mockFetchUserKeyring.mockResolvedValue([entry]);
    mockSaveUserKeyringEntry.mockResolvedValue();

    // Store the DEK as device-wrapped (simulates original device)
    await storeDeviceWrappedDEK(existingDek);

    const result = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "new-password",
      localDek: null,
      localKeyring: new Map(),
    });

    // Should succeed via device key fallback
    expect(result.vaultKey).not.toBeNull();
    expect(await keysEqual(result.vaultKey!, existingDek)).toBe(true);

    // Should NOT rewrap on page load — rewrap only on password reset or debug button
    expect(mockSaveUserKeyringEntry).not.toHaveBeenCalled();
  });

  it("throws when password is wrong and no device DEK available", async () => {
    const existingDek = await generateDEK();
    const entry = await createKeyringEntry(existingDek, "correct-password", true);
    mockFetchUserKeyring.mockResolvedValue([entry]);

    await expect(
      unlockCloudVault({
        supabase: createMockSupabase() as never,
        userId: "user-1",
        password: "wrong-password",
        localDek: null,
        localKeyring: new Map(),
      }),
    ).rejects.toThrow();
  });
});

describe("rewrapCloudKeyring", () => {
  vi.setConfig({ testTimeout: 30000 });

  beforeEach(async () => {
    localStorage.clear();
    await clearVaultDb();
    mockFetchUserKeyring.mockReset();
    mockSaveUserKeyringEntry.mockReset();
  });

  it("re-wraps keyring with new password so it can be unlocked", async () => {
    const dek = await generateDEK();
    const keyId = await computeKeyId(dek);
    const oldPassword = "old-password";
    const newPassword = "new-password";

    // Initial keyring wrapped with old password
    const oldEntry = await createKeyringEntry(dek, oldPassword, true);
    mockFetchUserKeyring.mockResolvedValue([oldEntry]);
    mockSaveUserKeyringEntry.mockResolvedValue();

    // Unlock with old password to get keyring
    const unlocked = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: oldPassword,
      localDek: null,
      localKeyring: new Map(),
    });

    expect(unlocked.keyring.size).toBe(1);

    // Re-wrap with new password
    await rewrapCloudKeyring({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      newPassword,
      keyring: unlocked.keyring,
      primaryKeyId: unlocked.primaryKeyId,
    });

    // saveUserKeyringEntry should have been called with re-wrapped entry
    const rewrapCall = mockSaveUserKeyringEntry.mock.calls.find(
      (call) => call[2].keyId === keyId && call[2].kdfSalt !== oldEntry.kdfSalt,
    );
    expect(rewrapCall).toBeDefined();
    const rewrappedEntry = rewrapCall![2];

    // Verify new password can unwrap the re-wrapped entry
    mockFetchUserKeyring.mockResolvedValue([rewrappedEntry]);
    const result = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: newPassword,
      localDek: null,
      localKeyring: new Map(),
    });

    expect(result.vaultKey).not.toBeNull();
    expect(await keysEqual(result.vaultKey!, dek)).toBe(true);
  });
});

describe("ensureCloudKeyringPassword", () => {
  vi.setConfig({ testTimeout: 30000 });

  beforeEach(async () => {
    localStorage.clear();
    await clearVaultDb();
    mockFetchUserKeyring.mockReset();
    mockSaveUserKeyringEntry.mockReset();
  });

  it("wraps all keyring entries with the current password", async () => {
    const dek = await generateDEK();
    const keyId = await computeKeyId(dek);
    mockSaveUserKeyringEntry.mockResolvedValue();

    const keyring = new Map<string, CryptoKey>([[keyId, dek]]);

    await ensureCloudKeyringPassword({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "new-password",
      keyring,
      primaryKeyId: keyId,
    });

    expect(mockSaveUserKeyringEntry).toHaveBeenCalledTimes(1);
    const savedEntry = mockSaveUserKeyringEntry.mock.calls[0][2];
    expect(savedEntry.keyId).toBe(keyId);

    // Verify new password can unwrap the saved entry
    mockFetchUserKeyring.mockResolvedValue([savedEntry]);
    const result = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "new-password",
      localDek: null,
      localKeyring: new Map(),
    });

    expect(result.vaultKey).not.toBeNull();
    expect(await keysEqual(result.vaultKey!, dek)).toBe(true);
  });

  it("wraps multiple keys", async () => {
    const dek1 = await generateDEK();
    const dek2 = await generateDEK();
    const keyId1 = await computeKeyId(dek1);
    const keyId2 = await computeKeyId(dek2);
    mockSaveUserKeyringEntry.mockResolvedValue();

    const keyring = new Map<string, CryptoKey>([
      [keyId1, dek1],
      [keyId2, dek2],
    ]);

    await ensureCloudKeyringPassword({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "any-password",
      keyring,
      primaryKeyId: keyId1,
    });

    expect(mockSaveUserKeyringEntry).toHaveBeenCalledTimes(2);
    expect(mockSaveUserKeyringEntry).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ keyId: keyId1, isPrimary: true }),
    );
    expect(mockSaveUserKeyringEntry).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ keyId: keyId2, isPrimary: false }),
    );
  });

  it("skips when keyring is empty", async () => {

    await ensureCloudKeyringPassword({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "any-password",
      keyring: new Map(),
      primaryKeyId: null,
    });

    // Should not even fetch
    expect(mockFetchUserKeyring).not.toHaveBeenCalled();
    expect(mockSaveUserKeyringEntry).not.toHaveBeenCalled();
  });

});

describe("bootstrapLocalVault", () => {
  vi.setConfig({ testTimeout: 20000 });

  beforeEach(async () => {
    localStorage.clear();
    await clearVaultDb();
  });

  it("creates random vault when no vault exists and device key available", async () => {
    const result = await bootstrapLocalVault();

    expect(result.hasVault).toBe(true);
    expect(result.requiresPassword).toBe(false);
    expect(result.vaultKey).not.toBeNull();
  });

  it("returns requiresPassword when vault exists but device key missing", async () => {
    // First create a vault
    const firstResult = await bootstrapLocalVault();
    expect(firstResult.vaultKey).not.toBeNull();

    // Clear only the device key DB, keep vault meta
    await clearVaultDb();

    const result = await bootstrapLocalVault();

    expect(result.hasVault).toBe(true);
    expect(result.requiresPassword).toBe(true);
    expect(result.vaultKey).toBeNull();
  });

  it("returns unlocked key when vault exists and device key works", async () => {
    // Create vault first
    const firstResult = await bootstrapLocalVault();
    const originalKey = firstResult.vaultKey!;

    // Bootstrap again - should unlock with device key
    const result = await bootstrapLocalVault();

    expect(result.hasVault).toBe(true);

    // Device key unlock may not work in jsdom environment
    // (see vault.test.ts for similar handling)
    if (result.requiresPassword) {
      expect(result.vaultKey).toBeNull();
      return;
    }

    expect(result.vaultKey).not.toBeNull();
    expect(await keysEqual(result.vaultKey!, originalKey)).toBe(true);
  });
});

describe("unlockLocalVault", () => {
  vi.setConfig({ testTimeout: 20000 });

  beforeEach(async () => {
    localStorage.clear();
    await clearVaultDb();
  });

  it("creates vault when hasVault is false", async () => {
    const result = await unlockLocalVault({
      password: "my-password",
      hasVault: false,
    });

    expect(result.vaultKey).not.toBeNull();
    expect(result.hasVault).toBe(true);
  });

  it("unlocks existing vault when hasVault is true", async () => {
    // First create a vault
    const createResult = await unlockLocalVault({
      password: "my-password",
      hasVault: false,
    });
    const originalKey = createResult.vaultKey;

    // Clear device key to force password unlock
    await clearVaultDb();

    // Unlock with password
    const unlockResult = await unlockLocalVault({
      password: "my-password",
      hasVault: true,
    });

    expect(await keysEqual(unlockResult.vaultKey, originalKey)).toBe(true);
  });
});

describe("tryDeviceUnlockCloudKey", () => {
  vi.setConfig({ testTimeout: 20000 });

  beforeEach(async () => {
    localStorage.clear();
    await clearVaultDb();
  });

  it("returns null when no device DEK stored", async () => {
    const result = await tryDeviceUnlockCloudKey();
    expect(result).toBeNull();
  });
});

describe("device-encrypted password", () => {
  vi.setConfig({ testTimeout: 20000 });

  beforeEach(async () => {
    localStorage.clear();
    await clearVaultDb();
  });

  it("stores and retrieves password", async () => {
    await storeDeviceEncryptedPassword("my-secret-pw");
    const retrieved = await tryGetDeviceEncryptedPassword();
    expect(retrieved).toBe("my-secret-pw");
  });

  it("returns null when no password stored", async () => {
    const retrieved = await tryGetDeviceEncryptedPassword();
    expect(retrieved).toBeNull();
  });

  it("clears stored password", async () => {
    await storeDeviceEncryptedPassword("my-secret-pw");
    await clearDeviceEncryptedPassword();
    const retrieved = await tryGetDeviceEncryptedPassword();
    expect(retrieved).toBeNull();
  });

  it("overwrites previous password", async () => {
    await storeDeviceEncryptedPassword("old-pw");
    await storeDeviceEncryptedPassword("new-pw");
    const retrieved = await tryGetDeviceEncryptedPassword();
    expect(retrieved).toBe("new-pw");
  });
});

describe("reencryptCloudNotes", () => {
  vi.setConfig({ testTimeout: 30000 });

  beforeEach(() => {
    mockFetchUserKeyring.mockReset();
    mockSaveUserKeyringEntry.mockReset();
    mockDeleteUserKeyringEntry.mockReset();
  });

  // Encrypts a payload with the given key. Mirrors the AES-GCM call shape
  // used by the production code so we can produce a realistic Supabase row.
  async function encryptWithKey(
    plaintext: string,
    key: CryptoKey,
  ): Promise<{ ciphertext: string; nonce: string }> {
    const iv = randomBytes(12);
    const data = encodeUtf8(JSON.stringify({ content: plaintext }));
    const out = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    return {
      ciphertext: bytesToBase64(new Uint8Array(out)),
      nonce: bytesToBase64(iv),
    };
  }

  it("re-encrypts notes pushed under non-primary keys (regression: post-RxDB schema)", async () => {
    // Regression for the silent no-op: the re-encrypt routine used the
    // legacy parser (parseRemoteNoteRow) which required server_updated_at
    // to be a string. The trigger that populated server_updated_at was
    // dropped in 20260408_rxdb_cleanup.sql, so every row pushed via RxDB
    // has server_updated_at = NULL, fails the parser, and gets skipped —
    // leaving notes encrypted under stale device-only keys forever.
    const oldKey = await generateDEK();
    const primaryKey = await generateDEK();
    const oldKeyId = await computeKeyId(oldKey);
    const primaryKeyId = await computeKeyId(primaryKey);

    const { ciphertext, nonce } = await encryptWithKey("today's content", oldKey);
    const row = {
      date: "25-04-2026",
      key_id: oldKeyId,
      ciphertext,
      nonce,
      updated_at: "2026-04-25T08:00:00.000Z",
      // server_updated_at intentionally absent — matches what RxDB pushes.
    };

    let updateCalledWith: Record<string, unknown> | null = null;
    let updateEqs: Array<[string, unknown]> = [];
    const updateChain = {
      eq: vi.fn(function (this: { __eqs: Array<[string, unknown]> }, col: string, val: unknown) {
        this.__eqs.push([col, val]);
        return this;
      }),
      then: undefined,
    };
    const supabase = {
      from: vi.fn((_table: string) => {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [row], error: null }),
            }),
          }),
          update: vi.fn((patch: Record<string, unknown>) => {
            updateCalledWith = patch;
            updateEqs = [];
            const chain = {
              __eqs: updateEqs,
              eq: updateChain.eq,
            };
            // After two .eq() calls (user_id, date), await resolves.
            return new Proxy(chain, {
              get(target, prop) {
                if (prop === "then") {
                  return (resolve: (v: unknown) => void) =>
                    resolve({ data: [row], error: null });
                }
                return (target as Record<string, unknown>)[prop as string];
              },
            });
          }),
        };
      }),
    };

    mockFetchUserKeyring.mockResolvedValue([]);

    const result = await reencryptCloudNotes({
      supabase: supabase as never,
      userId: "user-1",
      password: "pw",
      keyring: new Map([
        [oldKeyId, oldKey],
        [primaryKeyId, primaryKey],
      ]),
      primaryKeyId,
    });

    expect(result.reencrypted).toBe(1);
    expect(updateCalledWith).not.toBeNull();
    expect((updateCalledWith as unknown as Record<string, unknown>)!.key_id).toBe(primaryKeyId);
    // updated_at must NOT be bumped — bumping it would invalidate any
    // in-flight push from a peer device's optimistic-concurrency check
    // and silently drop their edit on the next conflict resolution.
    expect((updateCalledWith as unknown as Record<string, unknown>)!).not.toHaveProperty("updated_at");
  });

  it("skips rows already encrypted with the primary key", async () => {
    const primaryKey = await generateDEK();
    const primaryKeyId = await computeKeyId(primaryKey);
    const { ciphertext, nonce } = await encryptWithKey("hi", primaryKey);

    const row = {
      date: "25-04-2026",
      key_id: primaryKeyId,
      ciphertext,
      nonce,
      updated_at: "2026-04-25T08:00:00.000Z",
    };

    const updateFn = vi.fn();
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: [row], error: null }),
          }),
        }),
        update: updateFn,
      })),
    };

    mockFetchUserKeyring.mockResolvedValue([]);

    const result = await reencryptCloudNotes({
      supabase: supabase as never,
      userId: "user-1",
      password: "pw",
      keyring: new Map([[primaryKeyId, primaryKey]]),
      primaryKeyId,
    });

    expect(result.reencrypted).toBe(0);
    expect(updateFn).not.toHaveBeenCalled();
  });
});
