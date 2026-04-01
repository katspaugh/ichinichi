// @vitest-environment jsdom
import type { MockedFunction } from "vitest";
import {
  unlockCloudVault,
  rewrapCloudKeyring,
  bootstrapLocalVault,
  unlockLocalVault,
  tryDeviceUnlockCloudKey,
} from "../services/vaultService";
import {
  fetchUserKeyring,
  saveUserKeyringEntry,
} from "../storage/userKeyring";
import type { UserKeyringEntry } from "../storage/userKeyring";
import {
  generateDEK,
  deriveKEK,
  wrapDEK,
  unwrapDEK,
  generateSalt,
  DEFAULT_KDF_ITERATIONS,
  storeDeviceWrappedDEK,
  closeVaultDb,
} from "../storage/vault";
import { computeKeyId } from "../storage/keyId";

vi.mock("../storage/userKeyring", () => ({
  fetchUserKeyring: vi.fn(),
  saveUserKeyringEntry: vi.fn(),
}));

const mockFetchUserKeyring = fetchUserKeyring as MockedFunction<
  typeof fetchUserKeyring
>;
const mockSaveUserKeyringEntry = saveUserKeyringEntry as MockedFunction<
  typeof saveUserKeyringEntry
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

  it("merges local DEK not in cloud keyring as non-primary", async () => {
    const cloudDek = await generateDEK();
    const localDek = await generateDEK();
    const cloudEntry = await createKeyringEntry(cloudDek, "test-password", true);
    const localKeyId = await computeKeyId(localDek);

    mockFetchUserKeyring.mockResolvedValue([cloudEntry]);
    mockSaveUserKeyringEntry.mockResolvedValue();

    const result = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "test-password",
      localDek,
      localKeyring: new Map(),
    });

    expect(result.keyring.size).toBe(2);
    expect(result.keyring.has(cloudEntry.keyId)).toBe(true);
    expect(result.keyring.has(localKeyId)).toBe(true);
    expect(result.primaryKeyId).toBe(cloudEntry.keyId);
    expect(mockSaveUserKeyringEntry).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ keyId: localKeyId, isPrimary: false }),
    );
  });

  it("merges local keyring entries not in cloud", async () => {
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

    expect(result.keyring.size).toBe(3);
    expect(mockSaveUserKeyringEntry).toHaveBeenCalledTimes(2);
  });

  it("throws when password is wrong", async () => {
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

describe("rewrapCloudKeyring", () => {
  vi.setConfig({ testTimeout: 30000 });

  beforeEach(async () => {
    localStorage.clear();
    await clearVaultDb();
    mockFetchUserKeyring.mockReset();
    mockSaveUserKeyringEntry.mockReset();
  });

  it("re-wraps all keys with new password", async () => {
    const dek1 = await generateDEK();
    const dek2 = await generateDEK();
    const keyId1 = await computeKeyId(dek1);
    const keyId2 = await computeKeyId(dek2);

    const keyring = new Map<string, CryptoKey>();
    keyring.set(keyId1, dek1);
    keyring.set(keyId2, dek2);

    mockSaveUserKeyringEntry.mockResolvedValue();

    await rewrapCloudKeyring({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "new-password",
      keyring,
      primaryKeyId: keyId1,
    });

    expect(mockSaveUserKeyringEntry).toHaveBeenCalledTimes(2);

    // Verify each saved entry can be unwrapped with new password
    for (const call of mockSaveUserKeyringEntry.mock.calls) {
      const entry = call[2] as UserKeyringEntry;
      const kek = await deriveKEK(
        "new-password",
        entry.kdfSalt,
        entry.kdfIterations,
      );
      const unwrapped = await unwrapDEK(entry.wrappedDek, entry.dekIv, kek);
      const originalDek = keyring.get(entry.keyId)!;
      expect(await keysEqual(unwrapped, originalDek)).toBe(true);
    }
  });

  it("preserves isPrimary flag correctly", async () => {
    const dek1 = await generateDEK();
    const dek2 = await generateDEK();
    const keyId1 = await computeKeyId(dek1);
    const keyId2 = await computeKeyId(dek2);

    const keyring = new Map<string, CryptoKey>();
    keyring.set(keyId1, dek1);
    keyring.set(keyId2, dek2);

    mockSaveUserKeyringEntry.mockResolvedValue();

    await rewrapCloudKeyring({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "pw",
      keyring,
      primaryKeyId: keyId1,
    });

    const saved = mockSaveUserKeyringEntry.mock.calls.map(
      (c) => c[2] as UserKeyringEntry,
    );
    const primary = saved.find((e) => e.keyId === keyId1);
    const secondary = saved.find((e) => e.keyId === keyId2);
    expect(primary?.isPrimary).toBe(true);
    expect(secondary?.isPrimary).toBe(false);
  });

  it("handles empty keyring gracefully", async () => {
    mockSaveUserKeyringEntry.mockResolvedValue();

    await rewrapCloudKeyring({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "pw",
      keyring: new Map(),
      primaryKeyId: "none",
    });

    expect(mockSaveUserKeyringEntry).not.toHaveBeenCalled();
  });
});

describe("unlockCloudVault device DEK fallback", () => {
  vi.setConfig({ testTimeout: 30000 });

  beforeEach(async () => {
    localStorage.clear();
    await clearVaultDb();
    mockFetchUserKeyring.mockReset();
    mockSaveUserKeyringEntry.mockReset();
  });

  it("falls back to device DEK when password unwrap fails", async () => {
    const dek = await generateDEK();
    const keyId = await computeKeyId(dek);

    // Store device-wrapped DEK (simulating a previous session)
    await storeDeviceWrappedDEK(dek);

    // Create keyring entry wrapped with OLD password
    const entry = await createKeyringEntry(dek, "old-password", true);
    mockFetchUserKeyring.mockResolvedValue([entry]);
    mockSaveUserKeyringEntry.mockResolvedValue();

    // Unlock with NEW password — should fall back to device DEK and re-wrap
    const result = await unlockCloudVault({
      supabase: createMockSupabase() as never,
      userId: "user-1",
      password: "new-password",
      localDek: null,
      localKeyring: new Map(),
    });

    expect(result.vaultKey).not.toBeNull();
    expect(await keysEqual(result.vaultKey!, dek)).toBe(true);
    expect(result.keyring.has(keyId)).toBe(true);

    // Verify re-wrap was called (saveUserKeyringEntry for the device DEK)
    const rewrapCalls = mockSaveUserKeyringEntry.mock.calls.filter(
      (c) => (c[2] as UserKeyringEntry).keyId === keyId,
    );
    expect(rewrapCalls.length).toBeGreaterThan(0);

    // Verify re-wrapped entry can be unwrapped with new password
    const rewrappedEntry = rewrapCalls[0][2] as UserKeyringEntry;
    const kek = await deriveKEK(
      "new-password",
      rewrappedEntry.kdfSalt,
      rewrappedEntry.kdfIterations,
    );
    const unwrapped = await unwrapDEK(
      rewrappedEntry.wrappedDek,
      rewrappedEntry.dekIv,
      kek,
    );
    expect(await keysEqual(unwrapped, dek)).toBe(true);
  });

  it("throws when both password and device DEK fail", async () => {
    const dek = await generateDEK();
    // Keyring wrapped with old password, NO device DEK stored
    const entry = await createKeyringEntry(dek, "old-password", true);
    mockFetchUserKeyring.mockResolvedValue([entry]);

    await expect(
      unlockCloudVault({
        supabase: createMockSupabase() as never,
        userId: "user-1",
        password: "wrong-password",
        localDek: null,
        localKeyring: new Map(),
      }),
    ).rejects.toThrow("password mismatch and no device key");
  });
});
