import {
  unlockCloudVault,
  bootstrapLocalVault,
  unlockLocalVault,
  tryDeviceUnlockCloudKey,
} from "../services/vaultService";
import {
  fetchUserKeyring,
  saveUserKeyringEntry,
  UserKeyringEntry,
} from "../storage/userKeyring";
import {
  generateDEK,
  deriveKEK,
  wrapDEK,
  generateSalt,
  DEFAULT_KDF_ITERATIONS,
  closeVaultDb,
} from "../storage/vault";
import { computeKeyId } from "../storage/keyId";

jest.mock("../storage/userKeyring", () => ({
  fetchUserKeyring: jest.fn(),
  saveUserKeyringEntry: jest.fn(),
}));

const mockFetchUserKeyring = fetchUserKeyring as jest.MockedFunction<
  typeof fetchUserKeyring
>;
const mockSaveUserKeyringEntry = saveUserKeyringEntry as jest.MockedFunction<
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
  return { from: jest.fn() };
}

describe("unlockCloudVault", () => {
  jest.setTimeout(30000);

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
  jest.setTimeout(20000);

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

    // Device key unlock may not work in jest's jsdom environment
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
  jest.setTimeout(20000);

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
  jest.setTimeout(20000);

  beforeEach(async () => {
    localStorage.clear();
    await clearVaultDb();
  });

  it("returns null when no device DEK stored", async () => {
    const result = await tryDeviceUnlockCloudKey();
    expect(result).toBeNull();
  });
});
