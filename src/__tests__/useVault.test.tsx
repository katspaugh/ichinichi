// @vitest-environment jsdom
import { vaultReducer } from "../hooks/useVault";
import type { VaultState } from "../hooks/useVault";
import type { VaultService } from "../domain/vault";
import type { User } from "@supabase/supabase-js";

function createVaultService(
  overrides?: Partial<VaultService>,
): VaultService {
  return {
    tryDeviceUnlockCloudKey: vi.fn().mockResolvedValue(null),
    unlockCloudVault: vi.fn(),
    getHasLocalVault: vi.fn(),
    bootstrapLocalVault: vi.fn(),
    unlockLocalVault: vi.fn(),
    ...overrides,
  };
}

function createUser(): User {
  return {
    id: "user-1",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00.000Z",
  } as User;
}

function initialState(): VaultState {
  return {
    phase: "signedOut",
    vaultService: null,
    userId: null,
    password: null,
    localDek: null,
    localKeyring: new Map(),
    vaultKey: null,
    keyring: new Map(),
    primaryKeyId: null,
    lastFailedPassword: null,
    isReady: false,
    isBusy: false,
    error: null,
  };
}

describe("vaultReducer", () => {
  it("transitions signedOut → deviceUnlocking on user input", () => {
    const vs = createVaultService();
    const next = vaultReducer(initialState(), {
      type: "INPUTS_CHANGED",
      vaultService: vs,
      user: createUser(),
      password: null,
      localDek: null,
      localKeyring: new Map(),
    });
    expect(next.phase).toBe("deviceUnlocking");
    expect(next.isBusy).toBe(true);
  });

  it("transitions deviceUnlocking → ready on device unlock", () => {
    const state: VaultState = {
      ...initialState(),
      phase: "deviceUnlocking",
      isBusy: true,
    };
    const key = {} as CryptoKey;
    const next = vaultReducer(state, {
      type: "DEVICE_UNLOCKED",
      vaultKey: key,
      keyId: "key-1",
    });
    expect(next.phase).toBe("ready");
    expect(next.vaultKey).toBe(key);
    expect(next.isReady).toBe(true);
  });

  it("transitions deviceUnlocking → locked on unlock failure", () => {
    const state: VaultState = {
      ...initialState(),
      phase: "deviceUnlocking",
      isBusy: true,
    };
    const next = vaultReducer(state, { type: "UNLOCK_FAILED" });
    expect(next.phase).toBe("locked");
    expect(next.isReady).toBe(true);
    expect(next.isBusy).toBe(false);
  });

  it("auto-transitions locked → unlocking when password available", () => {
    const vs = createVaultService();
    const state: VaultState = {
      ...initialState(),
      phase: "deviceUnlocking",
      vaultService: vs,
      userId: "user-1",
      password: "secret",
      isBusy: true,
    };
    const next = vaultReducer(state, { type: "UNLOCK_FAILED" });
    expect(next.phase).toBe("unlocking");
    expect(next.isBusy).toBe(true);
  });

  it("sets error on password unlock failure", () => {
    const state: VaultState = {
      ...initialState(),
      phase: "unlocking",
      password: "secret",
      isBusy: true,
    };
    const next = vaultReducer(state, { type: "UNLOCK_FAILED" });
    expect(next.phase).toBe("locked");
    expect(next.error).toBeTruthy();
    expect(next.lastFailedPassword).toBe("secret");
  });

  it("does not auto-retry with same failed password", () => {
    const state: VaultState = {
      ...initialState(),
      phase: "unlocking",
      password: "secret",
      isBusy: true,
    };
    const next = vaultReducer(state, { type: "UNLOCK_FAILED" });
    // lastFailedPassword === password → stays locked
    expect(next.phase).toBe("locked");
  });

  it("clears error", () => {
    const state: VaultState = {
      ...initialState(),
      error: "some error",
    };
    const next = vaultReducer(state, { type: "CLEAR_ERROR" });
    expect(next.error).toBeNull();
  });

  it("resets vault on signout (noUser from ready)", () => {
    const vs = createVaultService();
    const state: VaultState = {
      ...initialState(),
      phase: "ready",
      vaultService: vs,
      userId: "user-1",
      vaultKey: {} as CryptoKey,
      isReady: true,
    };
    const next = vaultReducer(state, {
      type: "INPUTS_CHANGED",
      vaultService: vs,
      user: null,
      password: null,
      localDek: null,
      localKeyring: new Map(),
    });
    expect(next.phase).toBe("signedOut");
    expect(next.vaultKey).toBeNull();
    expect(next.isReady).toBe(true);
  });
});
