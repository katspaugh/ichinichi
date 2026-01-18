import { createActor } from "xstate";
import { waitFor } from "@testing-library/react";
import { vaultMachine } from "../hooks/useVault";
import type { VaultService } from "../domain/vault";
import type { User } from "@supabase/supabase-js";

async function createKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
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

describe("vaultMachine", () => {
  it("transitions to ready state for a signed-in user", async () => {
    const vaultKey = await createKey();
    const vaultService: VaultService = {
      tryDeviceUnlockCloudKey: jest
        .fn()
        .mockResolvedValue({ vaultKey, keyId: "key-1" }),
      unlockCloudVault: jest.fn(),
      getHasLocalVault: jest.fn(),
      bootstrapLocalVault: jest.fn(),
      unlockLocalVault: jest.fn(),
    };

    const actor = createActor(vaultMachine);
    actor.start();

    actor.send({
      type: "INPUTS_CHANGED",
      vaultService,
      user: createUser(),
      password: null,
      localDek: null,
      localKeyring: new Map(),
    });

    await waitFor(() => expect(actor.getSnapshot().context.isReady).toBe(true));
    actor.stop();
  });

  it("stores an error message on password unlock failure", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const vaultService: VaultService = {
      tryDeviceUnlockCloudKey: jest.fn().mockResolvedValue(null),
      unlockCloudVault: jest.fn().mockRejectedValue(new Error("fail")),
      getHasLocalVault: jest.fn(),
      bootstrapLocalVault: jest.fn(),
      unlockLocalVault: jest.fn(),
    };

    const actor = createActor(vaultMachine);
    actor.start();

    actor.send({
      type: "INPUTS_CHANGED",
      vaultService,
      user: createUser(),
      password: null,
      localDek: null,
      localKeyring: new Map(),
    });

    await waitFor(() => expect(actor.getSnapshot().context.isReady).toBe(true));

    actor.send({
      type: "INPUTS_CHANGED",
      vaultService,
      user: createUser(),
      password: "secret",
      localDek: null,
      localKeyring: new Map(),
    });

    await waitFor(() => expect(actor.getSnapshot().context.error).toBeTruthy());
    actor.stop();
    consoleError.mockRestore();
  });
});
