import { useCallback, useEffect, useMemo, useState } from "react";
import { useMachine } from "@xstate/react";
import { assign, fromCallback, setup } from "xstate";
import type { UseAuthReturn } from "./useAuth";
import type { VaultService } from "../domain/vault";
import { useLocalVault } from "./useLocalVault";
import { useVault } from "./useVault";
import { AppMode } from "./useAppMode";
import { useServiceContext } from "../contexts/serviceContext";
import { createCancellableOperation } from "../utils/asyncHelpers";
import { computeKeyId } from "../storage/keyId";
import {
  listLocalKeyIds,
  restoreLocalWrappedKey,
  storeLocalWrappedKey,
} from "../storage/localKeyring";

interface UseActiveVaultProps {
  auth: UseAuthReturn;
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

export interface UseActiveVaultReturn {
  auth: UseAuthReturn;
  localVault: ReturnType<typeof useLocalVault>;
  cloudVault: ReturnType<typeof useVault>;
  authPassword: string | null;
  localPassword: string | null;
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  activeKeyId: string | null;
  cloudPrimaryKey: CryptoKey | null;
  isVaultReady: boolean;
  isVaultLocked: boolean;
  isVaultUnlocked: boolean;
  vaultError: string | null;
  handleLocalUnlock: (password: string) => Promise<boolean>;
  handleSignIn: (email: string, password: string) => Promise<void>;
  handleSignUp: (email: string, password: string) => Promise<void>;
  handleSignOut: () => Promise<void>;
  clearVaultError: () => void;
  setLocalPassword: (password: string | null) => void;
}

type ActiveVaultEvent =
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

export function useActiveVault({
  auth,
  mode,
  setMode,
}: UseActiveVaultProps): UseActiveVaultReturn {
  const { vaultService } = useServiceContext();
  const localVault = useLocalVault({ vaultService });
  const [authPassword, setAuthPassword] = useState<string | null>(null);
  const [localPassword, setLocalPassword] = useState<string | null>(null);
  const [state, send] = useMachine(activeVaultMachine);

  const handlePasswordConsumed = useCallback(() => {
    setAuthPassword(null);
  }, []);

  const cloudVault = useVault({
    vaultService,
    user: mode === AppMode.Cloud ? auth.user : null,
    password: authPassword,
    localDek: localVault.vaultKey,
    localKeyring: state.context.localKeyring,
    onPasswordConsumed: handlePasswordConsumed,
  });

  useEffect(() => {
    send({
      type: "INPUTS_CHANGED",
      vaultService,
      mode,
      authUserId: auth.user?.id ?? null,
      vaultKey: localVault.vaultKey,
      cloudKeyring: cloudVault.keyring,
      cloudPrimaryKeyId: cloudVault.primaryKeyId,
      localKeyring: state.context.localKeyring,
    });
  }, [
    send,
    vaultService,
    mode,
    auth.user,
    localVault.vaultKey,
    cloudVault.keyring,
    cloudVault.primaryKeyId,
    state.context.localKeyring,
  ]);

  const mergedKeyring = useMemo(() => {
    const merged = new Map<string, CryptoKey>();
    state.context.localKeyring.forEach((value, key) => merged.set(key, value));
    cloudVault.keyring.forEach((value, key) => merged.set(key, value));
    if (cloudVault.primaryKeyId && !merged.has("legacy")) {
      const primary = cloudVault.keyring.get(cloudVault.primaryKeyId);
      if (primary) {
        merged.set("legacy", primary);
      }
    }
    return merged;
  }, [state.context.localKeyring, cloudVault.keyring, cloudVault.primaryKeyId]);

  const cloudPrimaryKey =
    cloudVault.vaultKey ?? state.context.restoredCloudVaultKey;

  const candidateKeyId =
    mode === AppMode.Cloud && cloudVault.primaryKeyId
      ? cloudVault.primaryKeyId
      : state.context.localKeyId;
  const activeKeyId =
    candidateKeyId && mergedKeyring.has(candidateKeyId) ? candidateKeyId : null;
  const vaultKey = activeKeyId
    ? (mergedKeyring.get(activeKeyId) ?? null)
    : null;

  const isVaultReady =
    mode === AppMode.Cloud ? cloudVault.isReady : localVault.isReady;
  const isVaultLocked =
    mode === AppMode.Cloud ? cloudVault.isLocked : localVault.isLocked;
  const vaultError =
    mode === AppMode.Cloud ? cloudVault.error : localVault.error;
  const isVaultUnlocked = !isVaultLocked && isVaultReady;

  const handleLocalUnlock = useCallback(
    async (password: string) => {
      const success = await localVault.unlock(password);
      if (success) {
        setLocalPassword(password);
      }
      return success;
    },
    [localVault],
  );

  const handleSignIn = useCallback(
    async (email: string, password: string) => {
      const result = await auth.signIn(email, password);
      if (result.success && result.password) {
        setAuthPassword(result.password);
        setMode(AppMode.Cloud);
      }
    },
    [auth, setMode],
  );

  const handleSignUp = useCallback(
    async (email: string, password: string) => {
      const result = await auth.signUp(email, password);
      if (result.success && result.password) {
        setAuthPassword(result.password);
        setMode(AppMode.Cloud);
      }
    },
    [auth, setMode],
  );

  const handleSignOut = useCallback(async () => {
    await auth.signOut();
    setMode(AppMode.Local);
    setAuthPassword(null);
  }, [auth, setMode]);

  const clearVaultError = useCallback(() => {
    if (mode === AppMode.Cloud) {
      cloudVault.clearError();
      return;
    }
    localVault.clearError();
  }, [cloudVault, localVault, mode]);

  return {
    auth,
    localVault,
    cloudVault,
    authPassword,
    localPassword,
    vaultKey,
    keyring: mergedKeyring,
    activeKeyId,
    cloudPrimaryKey,
    isVaultReady,
    isVaultLocked,
    isVaultUnlocked,
    vaultError,
    handleLocalUnlock,
    handleSignIn,
    handleSignUp,
    handleSignOut,
    clearVaultError,
    setLocalPassword,
  };
}
