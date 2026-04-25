// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { useActiveVault } from "../hooks/useActiveVault";
import { AppMode } from "../hooks/useAppMode";
import { AuthState } from "../types";
import { fetchAndUnwrapCloudKeyring } from "../services/vaultService";
import {
  storeDeviceEncryptedPassword,
  tryGetDeviceEncryptedPassword,
} from "../storage/vault";
import type { User } from "@supabase/supabase-js";

const mockUseLocalVault = vi.fn();
const mockUseVault = vi.fn();
const mockUseVaultMachine = vi.fn();
const mockUseServiceContext = vi.fn();
const mockHandleCloudAccountSwitch = vi.fn();
const mockCloseUnifiedDb = vi.fn();

vi.mock("../hooks/useLocalVault", () => ({
  useLocalVault: (...args: unknown[]) => mockUseLocalVault(...args),
}));

vi.mock("../hooks/useVault", () => ({
  useVault: (...args: unknown[]) => mockUseVault(...args),
}));

vi.mock("../hooks/useVaultMachine", () => ({
  useVaultMachine: (...args: unknown[]) => mockUseVaultMachine(...args),
}));

vi.mock("../contexts/serviceContext", () => ({
  useServiceContext: (...args: unknown[]) => mockUseServiceContext(...args),
}));

vi.mock("../storage/accountSwitch", () => ({
  handleCloudAccountSwitch: (...args: unknown[]) =>
    mockHandleCloudAccountSwitch(...args),
}));

vi.mock("../storage/unifiedDb", () => ({
  closeUnifiedDb: (...args: unknown[]) => mockCloseUnifiedDb(...args),
}));

vi.mock("../services/vaultService", () => ({
  ensureCloudKeyringPassword: vi.fn(),
  fetchAndUnwrapCloudKeyring: vi.fn(),
}));

vi.mock("../storage/vault", async () => {
  const actual = await vi.importActual("../storage/vault");
  return {
    ...actual,
    storeDeviceEncryptedPassword: vi.fn(),
    tryGetDeviceEncryptedPassword: vi.fn(),
    clearDeviceEncryptedPassword: vi.fn(),
  };
});

function createAuth() {
  return {
    session: null,
    user: { id: "user-1", email: "user@example.com" } as User,
    authState: AuthState.SignedIn,
    error: null,
    hashError: null,
    isBusy: false,
    isPasswordRecovery: false,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue({ success: true }),
    updatePassword: vi.fn().mockResolvedValue({ success: true }),
    clearPasswordRecovery: vi.fn(),
    clearHashError: vi.fn(),
    clearError: vi.fn(),
  };
}

async function createDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

describe("useActiveVault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseServiceContext.mockReturnValue({ vaultService: {} });
    mockUseLocalVault.mockReturnValue({
      vaultKey: null,
      isReady: true,
      isLocked: false,
      error: null,
      unlock: vi.fn().mockResolvedValue(true),
      clearError: vi.fn(),
    });
    mockUseVault.mockReturnValue({
      vaultKey: null,
      keyring: new Map(),
      primaryKeyId: null,
      isReady: true,
      isLocked: false,
      isBusy: false,
      error: null,
      clearError: vi.fn(),
    });
    mockUseVaultMachine.mockReturnValue([
      {
        context: {
          localKeyring: new Map(),
          localKeyId: null,
          restoredCloudVaultKey: null,
        },
      },
      vi.fn(),
    ]);
    mockHandleCloudAccountSwitch.mockResolvedValue(undefined);
    vi.mocked(tryGetDeviceEncryptedPassword).mockResolvedValue(null);
    vi.mocked(fetchAndUnwrapCloudKeyring).mockResolvedValue({
      keyring: new Map(),
      primaryKeyId: null,
    });
  });

  it("fetches extra cloud keys after device restore without rewrapping them", async () => {
    const localKey = await createDek();
    const cloudKey = await createDek();
    const fetchedKey = await createDek();
    mockUseVault.mockReturnValue({
      vaultKey: cloudKey,
      keyring: new Map([["cloud-key", cloudKey]]),
      primaryKeyId: "cloud-key",
      isReady: true,
      isLocked: false,
      isBusy: false,
      error: null,
      clearError: vi.fn(),
    });
    mockUseVaultMachine.mockReturnValue([
      {
        context: {
          localKeyring: new Map([["local-key", localKey]]),
          localKeyId: "local-key",
          restoredCloudVaultKey: null,
        },
      },
      vi.fn(),
    ]);
    vi.mocked(tryGetDeviceEncryptedPassword).mockResolvedValue(
      "stored-password",
    );
    vi.mocked(fetchAndUnwrapCloudKeyring).mockResolvedValue({
      keyring: new Map([["fetched-key", fetchedKey]]),
      primaryKeyId: "fetched-key",
    });

    const { result } = renderHook(() =>
      useActiveVault({
        auth: createAuth(),
        mode: AppMode.Cloud,
        setMode: vi.fn(),
      }),
    );

    await waitFor(() =>
      expect(fetchAndUnwrapCloudKeyring).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(result.current.keyring.has("fetched-key")).toBe(true),
    );
  });

  it("stores the typed password without auto-rewrapping on manual unlock", async () => {
    const cloudKey = await createDek();
    mockUseVault.mockReturnValue({
      vaultKey: cloudKey,
      keyring: new Map([["cloud-key", cloudKey]]),
      primaryKeyId: "cloud-key",
      isReady: true,
      isLocked: false,
      isBusy: false,
      error: null,
      clearError: vi.fn(),
    });

    const { result } = renderHook(() =>
      useActiveVault({
        auth: createAuth(),
        mode: AppMode.Cloud,
        setMode: vi.fn(),
      }),
    );

    await act(async () => {
      result.current.handleCloudVaultUnlock("typed-password");
    });

    await waitFor(() =>
      expect(storeDeviceEncryptedPassword).toHaveBeenCalledWith(
        "typed-password",
      ),
    );
  });

  it("never uses the device-only DEK as activeKeyId in Cloud mode", async () => {
    // Race window: device-unlock has loaded the local DEK into the vault
    // machine, but the cloud keyring fetch hasn't resolved yet so
    // cloudPrimaryKeyId is still null. Falling back to the local DEK here
    // would let the editor encrypt notes with a key the cloud doesn't know
    // about — those rows become permanently undecryptable on other devices.
    const localKey = await createDek();
    mockUseVault.mockReturnValue({
      vaultKey: null,
      keyring: new Map(),
      primaryKeyId: null,
      isReady: true,
      isLocked: false,
      isBusy: false,
      error: null,
      clearError: vi.fn(),
    });
    mockUseVaultMachine.mockReturnValue([
      {
        context: {
          localKeyring: new Map([["local-key", localKey]]),
          localKeyId: "local-key",
          restoredCloudVaultKey: null,
        },
      },
      vi.fn(),
    ]);

    const { result } = renderHook(() =>
      useActiveVault({
        auth: createAuth(),
        mode: AppMode.Cloud,
        setMode: vi.fn(),
      }),
    );

    expect(result.current.activeKeyId).toBeNull();
    expect(result.current.vaultKey).toBeNull();
  });

  it("uses local DEK as activeKeyId in Local mode", async () => {
    // Local mode is exempt from the Cloud-mode rule above — the local DEK
    // is the only key Local mode has and is correct to use.
    const localKey = await createDek();
    mockUseVaultMachine.mockReturnValue([
      {
        context: {
          localKeyring: new Map([["local-key", localKey]]),
          localKeyId: "local-key",
          restoredCloudVaultKey: null,
        },
      },
      vi.fn(),
    ]);

    const { result } = renderHook(() =>
      useActiveVault({
        auth: createAuth(),
        mode: AppMode.Local,
        setMode: vi.fn(),
      }),
    );

    expect(result.current.activeKeyId).toBe("local-key");
  });
});
