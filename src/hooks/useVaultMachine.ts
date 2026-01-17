import { useMachine } from "@xstate/react";
import { assign, fromCallback, setup } from "xstate";
import type { VaultService } from "../domain/vault";
import { AppMode } from "./useAppMode";
import { createCancellableOperation } from "../utils/asyncHelpers";
import { computeKeyId } from "../storage/keyId";
import {
  listLocalKeyIds,
  restoreLocalWrappedKey,
  storeLocalWrappedKey,
} from "../storage/localKeyring";

export type ActiveVaultEvent =
  | {
      type: "INPUTS_CHANGED";
      vaultService: VaultService;
      mode: AppMode;
      authUserId: string | null;
      vaultKey: CryptoKey | null;
      cloudKeyring: Map<string, CryptoKey>;
      cloudPrimaryKeyId: string | null;
      localKeyring: Map<string, CryptoKey>;
    }
  | {
      type: "LOCAL_KEYRING_LOADED";
      keyId: string;
      keyring: Map<string, CryptoKey>;
    }
  | { type: "CLOUD_KEY_CACHED" }
  | { type: "CLOUD_KEY_RESTORED"; vaultKey: CryptoKey };

interface ActiveVaultContext {
  vaultService: VaultService | null;
  mode: AppMode;
  authUserId: string | null;
  vaultKey: CryptoKey | null;
  cloudKeyring: Map<string, CryptoKey>;
  cloudPrimaryKeyId: string | null;
  localKeyring: Map<string, CryptoKey>;
  localKeyId: string | null;
  restoredCloudVaultKey: CryptoKey | null;
  hasCachedCloudKeys: boolean;
}

const localKeyringLoader = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: ActiveVaultEvent) => void;
    input: { localKey: CryptoKey };
  }) => {
    const { promise, cancel, signal } = createCancellableOperation(
      async (abortSignal) => {
        const keyId = await computeKeyId(input.localKey);
        if (abortSignal.aborted) return null;

        const entries = new Map<string, CryptoKey>();
        entries.set(keyId, input.localKey);

        const extraKeys = listLocalKeyIds().filter((id) => id !== keyId);
        for (const id of extraKeys) {
          if (abortSignal.aborted) {
            return null;
          }
          try {
            const restored = await restoreLocalWrappedKey(id, input.localKey);
            if (restored) {
              entries.set(id, restored);
            }
          } catch {
            // Ignore corrupted entries.
          }
        }

        return { keyId, keyring: entries };
      },
      { timeoutMs: 30000 },
    );

    void promise.then((result) => {
      if (!result || signal.aborted) return;
      sendBack({
        type: "LOCAL_KEYRING_LOADED",
        keyId: result.keyId,
        keyring: result.keyring,
      });
    });

    return () => {
      cancel();
    };
  },
);

const cloudKeyRestorer = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: ActiveVaultEvent) => void;
    input: { vaultService: VaultService };
  }) => {
    const { promise, cancel, signal } = createCancellableOperation(
      () => input.vaultService.tryDeviceUnlockCloudKey(),
      { timeoutMs: 30000 },
    );

    void promise.then((result) => {
      if (!result || signal.aborted) return;
      sendBack({ type: "CLOUD_KEY_RESTORED", vaultKey: result.vaultKey });
    });

    return () => {
      cancel();
    };
  },
);

const cloudKeyCacher = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: ActiveVaultEvent) => void;
    input: {
      localKey: CryptoKey;
      cloudKeyring: Map<string, CryptoKey>;
      localKeyId: string | null;
    };
  }) => {
    const { promise, cancel, signal } = createCancellableOperation(
      async (abortSignal) => {
        for (const [keyId, key] of input.cloudKeyring.entries()) {
          if (abortSignal.aborted) return false;
          if (keyId === input.localKeyId) continue;
          try {
            await storeLocalWrappedKey(keyId, key, input.localKey);
          } catch (error) {
            console.warn("Failed to cache cloud key locally:", error);
          }
        }
        return true;
      },
      { timeoutMs: 30000 },
    );

    void promise.then((didCache) => {
      if (!didCache || signal.aborted) return;
      sendBack({ type: "CLOUD_KEY_CACHED" });
    });

    return () => {
      cancel();
    };
  },
);

const activeVaultMachine = setup({
  types: {
    context: {} as ActiveVaultContext,
    events: {} as ActiveVaultEvent,
  },
  actors: {
    localKeyringLoader,
    cloudKeyRestorer,
    cloudKeyCacher,
  },
  actions: {
    applyInputs: assign((args: { event: ActiveVaultEvent }) => {
      const { event } = args;
      if (event.type !== "INPUTS_CHANGED") {
        return {};
      }
      return {
        vaultService: event.vaultService,
        mode: event.mode,
        authUserId: event.authUserId,
        vaultKey: event.vaultKey,
        cloudKeyring: event.cloudKeyring,
        cloudPrimaryKeyId: event.cloudPrimaryKeyId,
        localKeyring: event.localKeyring,
      };
    }),
    applyLocalKeyring: assign((args: { event: ActiveVaultEvent }) => {
      const { event } = args;
      if (event.type !== "LOCAL_KEYRING_LOADED") {
        return {};
      }
      return {
        localKeyId: event.keyId,
        localKeyring: event.keyring,
      };
    }),
    applyRestoredCloudKey: assign((args: { event: ActiveVaultEvent }) => {
      const { event } = args;
      if (event.type !== "CLOUD_KEY_RESTORED") {
        return {};
      }
      return { restoredCloudVaultKey: event.vaultKey };
    }),
    markCloudKeysCached: assign({ hasCachedCloudKeys: true }),
  },
  guards: {
    shouldRestoreCloudKey: ({ context }: { context: ActiveVaultContext }) =>
      !!context.vaultService &&
      !context.restoredCloudVaultKey &&
      !context.vaultKey &&
      context.mode === AppMode.Cloud,
    shouldLoadLocalKeyring: ({ context }: { context: ActiveVaultContext }) =>
      !!context.vaultKey && !context.localKeyId,
    shouldCacheCloudKeys: ({ context }: { context: ActiveVaultContext }) =>
      !!context.vaultKey &&
      context.cloudKeyring.size > 0 &&
      !context.hasCachedCloudKeys,
  },
}).createMachine({
  id: "activeVault",
  initial: "idle",
  context: {
    vaultService: null,
    mode: AppMode.Local,
    authUserId: null,
    vaultKey: null,
    cloudKeyring: new Map(),
    cloudPrimaryKeyId: null,
    localKeyring: new Map(),
    localKeyId: null,
    restoredCloudVaultKey: null,
    hasCachedCloudKeys: false,
  },
  on: {
    INPUTS_CHANGED: {
      actions: "applyInputs",
      target: ".evaluate",
    },
  },
  states: {
    idle: {},
    evaluate: {
      always: [
        { guard: "shouldRestoreCloudKey", target: "restoringCloudKey" },
        { guard: "shouldLoadLocalKeyring", target: "loadingLocalKeyring" },
        { guard: "shouldCacheCloudKeys", target: "cachingCloudKeys" },
        { target: "idle" },
      ],
    },
    restoringCloudKey: {
      invoke: {
        id: "cloudKeyRestorer",
        src: "cloudKeyRestorer",
        input: ({ context }: { context: ActiveVaultContext }) => ({
          vaultService: context.vaultService as VaultService,
        }),
      },
      on: {
        CLOUD_KEY_RESTORED: {
          target: "idle",
          actions: "applyRestoredCloudKey",
        },
        INPUTS_CHANGED: {
          target: "evaluate",
          actions: "applyInputs",
        },
      },
    },
    loadingLocalKeyring: {
      invoke: {
        id: "localKeyringLoader",
        src: "localKeyringLoader",
        input: ({ context }: { context: ActiveVaultContext }) => ({
          localKey: context.vaultKey as CryptoKey,
        }),
      },
      on: {
        LOCAL_KEYRING_LOADED: {
          target: "idle",
          actions: "applyLocalKeyring",
        },
        INPUTS_CHANGED: {
          target: "evaluate",
          actions: "applyInputs",
        },
      },
    },
    cachingCloudKeys: {
      invoke: {
        id: "cloudKeyCacher",
        src: "cloudKeyCacher",
        input: ({ context }: { context: ActiveVaultContext }) => ({
          localKey: context.vaultKey as CryptoKey,
          cloudKeyring: context.cloudKeyring,
          localKeyId: context.localKeyId,
        }),
      },
      on: {
        CLOUD_KEY_CACHED: {
          target: "idle",
          actions: "markCloudKeysCached",
        },
        INPUTS_CHANGED: {
          target: "evaluate",
          actions: "applyInputs",
        },
      },
    },
  },
});

export function useVaultMachine() {
  return useMachine(activeVaultMachine);
}
