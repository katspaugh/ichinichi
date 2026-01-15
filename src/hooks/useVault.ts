import { useCallback, useEffect } from "react";
import { useMachine } from "@xstate/react";
import { assign, fromCallback, setup } from "xstate";
import type { User } from "@supabase/supabase-js";
import type { VaultService } from "../domain/vault";

export interface UseVaultReturn {
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  primaryKeyId: string | null;
  isReady: boolean;
  isLocked: boolean;
  isBusy: boolean;
  error: string | null;
  clearError: () => void;
}

interface UseVaultProps {
  vaultService: VaultService;
  user: User | null;
  password: string | null;
  localDek: CryptoKey | null;
  localKeyring: Map<string, CryptoKey>;
  onPasswordConsumed: () => void;
}

type VaultEvent =
  | {
      type: "INPUTS_CHANGED";
      vaultService: VaultService;
      user: User | null;
      password: string | null;
      localDek: CryptoKey | null;
      localKeyring: Map<string, CryptoKey>;
    }
  | { type: "DEVICE_UNLOCKED"; vaultKey: CryptoKey; keyId: string }
  | {
      type: "PASSWORD_UNLOCKED";
      vaultKey: CryptoKey;
      keyring: Map<string, CryptoKey>;
      primaryKeyId: string;
    }
  | { type: "UNLOCK_FAILED" }
  | { type: "CLEAR_ERROR" };

interface VaultContext {
  vaultService: VaultService | null;
  userId: string | null;
  password: string | null;
  localDek: CryptoKey | null;
  localKeyring: Map<string, CryptoKey>;
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  primaryKeyId: string | null;
  isReady: boolean;
  isBusy: boolean;
  error: string | null;
}

const deviceUnlockActor = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: VaultEvent) => void;
    input: { vaultService: VaultService };
  }) => {
    let cancelled = false;

    const unlock = async () => {
      const result = await input.vaultService.tryDeviceUnlockCloudKey();
      if (!cancelled && result) {
        sendBack({
          type: "DEVICE_UNLOCKED",
          vaultKey: result.vaultKey,
          keyId: result.keyId,
        });
      }
      if (!cancelled && !result) {
        sendBack({ type: "UNLOCK_FAILED" });
      }
    };

    void unlock();

    return () => {
      cancelled = true;
    };
  },
);

const passwordUnlockActor = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: VaultEvent) => void;
    input: {
      vaultService: VaultService;
      userId: string;
      password: string;
      localDek: CryptoKey | null;
      localKeyring: Map<string, CryptoKey>;
    };
  }) => {
    let cancelled = false;

    const unlock = async () => {
      try {
        const result = await input.vaultService.unlockCloudVault({
          userId: input.userId,
          password: input.password,
          localDek: input.localDek,
          localKeyring: input.localKeyring,
        });
        if (!cancelled && result.vaultKey && result.primaryKeyId) {
          sendBack({
            type: "PASSWORD_UNLOCKED",
            vaultKey: result.vaultKey,
            keyring: result.keyring,
            primaryKeyId: result.primaryKeyId,
          });
        }
      } catch (error) {
        console.error("Vault unlock error:", error);
        if (!cancelled) {
          sendBack({ type: "UNLOCK_FAILED" });
        }
      }
    };

    void unlock();

    return () => {
      cancelled = true;
    };
  },
);

const vaultMachine = setup({
  types: {
    context: {} as VaultContext,
    events: {} as VaultEvent,
  },
  actors: {
    deviceUnlock: deviceUnlockActor,
    passwordUnlock: passwordUnlockActor,
  },
  actions: {
    applyInputs: assign((args: { event: VaultEvent }) => {
      const { event } = args;
      if (event.type !== "INPUTS_CHANGED") {
        return {};
      }
      return {
        vaultService: event.vaultService,
        userId: event.user?.id ?? null,
        password: event.password,
        localDek: event.localDek,
        localKeyring: event.localKeyring,
      };
    }),
    resetVault: assign({
      vaultKey: null,
      keyring: new Map(),
      primaryKeyId: null,
      isReady: true,
      isBusy: false,
      error: null,
    }),
    applyDeviceUnlock: assign((args: { event: VaultEvent }) => {
      const { event } = args;
      if (event.type !== "DEVICE_UNLOCKED") {
        return {};
      }
      return {
        vaultKey: event.vaultKey,
        keyring: new Map([[event.keyId, event.vaultKey]]),
        primaryKeyId: event.keyId,
        isBusy: false,
        isReady: true,
      };
    }),
    applyPasswordUnlock: assign((args: { event: VaultEvent }) => {
      const { event } = args;
      if (event.type !== "PASSWORD_UNLOCKED") {
        return {};
      }
      return {
        vaultKey: event.vaultKey,
        keyring: event.keyring,
        primaryKeyId: event.primaryKeyId,
        isBusy: false,
        isReady: true,
        error: null,
      };
    }),
    setErrorMessage: assign({
      isBusy: false,
      isReady: true,
      error: "Unable to unlock. Check your password and try again.",
    }),
    setReady: assign({ isReady: true, isBusy: false }),
    setBusy: assign({ isBusy: true, isReady: false }),
    clearError: assign({ error: null }),
  },
  guards: {
    hasUser: ({ event }: { event: VaultEvent }) =>
      event.type === "INPUTS_CHANGED" && !!event.user,
    noUser: ({ event }: { event: VaultEvent }) =>
      event.type === "INPUTS_CHANGED" && !event.user,
    hasPassword: ({ event }: { event: VaultEvent }) =>
      event.type === "INPUTS_CHANGED" && !!event.password,
  },
}).createMachine({
  id: "vault",
  initial: "signedOut",
  context: {
    vaultService: null,
    userId: null,
    password: null,
    localDek: null,
    localKeyring: new Map(),
    vaultKey: null,
    keyring: new Map(),
    primaryKeyId: null,
    isReady: false,
    isBusy: false,
    error: null,
  },
  on: {
    INPUTS_CHANGED: {
      actions: "applyInputs",
    },
    CLEAR_ERROR: {
      actions: "clearError",
    },
  },
  states: {
    signedOut: {
      entry: "resetVault",
      on: {
        INPUTS_CHANGED: {
          guard: "hasUser",
          target: "deviceUnlocking",
        },
      },
    },
    deviceUnlocking: {
      entry: ["clearError", "setBusy"],
      invoke: {
        id: "deviceUnlock",
        src: "deviceUnlock",
        input: ({ context }: { context: VaultContext }) => ({
          vaultService: context.vaultService as VaultService,
        }),
      },
      on: {
        DEVICE_UNLOCKED: {
          target: "ready",
          actions: "applyDeviceUnlock",
        },
        UNLOCK_FAILED: {
          target: "locked",
          actions: "setReady",
        },
        INPUTS_CHANGED: {
          guard: "noUser",
          target: "signedOut",
        },
      },
    },
    locked: {
      entry: "setReady",
      on: {
        INPUTS_CHANGED: [
          {
            guard: "noUser",
            target: "signedOut",
          },
          {
            guard: "hasPassword",
            target: "unlocking",
          },
        ],
      },
    },
    unlocking: {
      entry: ["clearError", "setBusy"],
      invoke: {
        id: "passwordUnlock",
        src: "passwordUnlock",
        input: ({ context }: { context: VaultContext }) => ({
          vaultService: context.vaultService as VaultService,
          userId: context.userId as string,
          password: context.password as string,
          localDek: context.localDek,
          localKeyring: context.localKeyring,
        }),
      },
      on: {
        PASSWORD_UNLOCKED: {
          target: "ready",
          actions: "applyPasswordUnlock",
        },
        UNLOCK_FAILED: {
          target: "locked",
          actions: "setErrorMessage",
        },
        INPUTS_CHANGED: {
          guard: "noUser",
          target: "signedOut",
        },
      },
    },
    ready: {
      entry: "setReady",
      on: {
        INPUTS_CHANGED: [
          {
            guard: "noUser",
            target: "signedOut",
          },
          {
            guard: "hasPassword",
            target: "unlocking",
          },
        ],
      },
    },
  },
});

export function useVault({
  vaultService,
  user,
  password,
  localDek,
  localKeyring,
  onPasswordConsumed,
}: UseVaultProps): UseVaultReturn {
  const [state, send] = useMachine(vaultMachine);

  useEffect(() => {
    send({
      type: "INPUTS_CHANGED",
      vaultService,
      user,
      password,
      localDek,
      localKeyring,
    });
  }, [send, vaultService, user, password, localDek, localKeyring]);

  useEffect(() => {
    if (password) {
      onPasswordConsumed();
    }
  }, [password, onPasswordConsumed]);

  const clearError = useCallback(() => {
    send({ type: "CLEAR_ERROR" });
  }, [send]);

  return {
    vaultKey: state.context.vaultKey,
    keyring: state.context.keyring,
    primaryKeyId: state.context.primaryKeyId,
    isReady: state.context.isReady,
    isLocked: !state.context.vaultKey,
    isBusy: state.context.isBusy,
    error: state.context.error,
    clearError,
  };
}
