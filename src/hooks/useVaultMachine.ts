import { useCallback, useEffect, useReducer } from "react";
import type { VaultService } from "../domain/vault";
import { AppMode } from "./useAppMode";
import { createCancellableOperation } from "../utils/asyncHelpers";
import { computeKeyId } from "../storage/keyId";
import {
  listLocalKeyIds,
  restoreLocalWrappedKey,
  storeLocalWrappedKey,
} from "../storage/localKeyring";
import { rememberCloudKeyIds } from "../storage/cloudKeyIdCache";

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

type ActiveVaultPhase =
  | "idle"
  | "restoringCloudKey"
  | "loadingLocalKeyring"
  | "cachingCloudKeys";

interface ActiveVaultState {
  phase: ActiveVaultPhase;
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

const initialState: ActiveVaultState = {
  phase: "idle",
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
};

function evaluate(state: ActiveVaultState): ActiveVaultPhase {
  if (
    state.vaultService &&
    !state.restoredCloudVaultKey &&
    !state.vaultKey &&
    state.mode === AppMode.Cloud
  ) {
    return "restoringCloudKey";
  }
  if (state.vaultKey && !state.localKeyId) {
    return "loadingLocalKeyring";
  }
  if (
    state.vaultKey &&
    state.cloudKeyring.size > 0 &&
    !state.hasCachedCloudKeys
  ) {
    return "cachingCloudKeys";
  }
  return "idle";
}

function activeVaultReducer(
  state: ActiveVaultState,
  event: ActiveVaultEvent,
): ActiveVaultState {
  switch (event.type) {
    case "INPUTS_CHANGED": {
      const updated: ActiveVaultState = {
        ...state,
        vaultService: event.vaultService,
        mode: event.mode,
        authUserId: event.authUserId,
        vaultKey: event.vaultKey,
        cloudKeyring: event.cloudKeyring,
        cloudPrimaryKeyId: event.cloudPrimaryKeyId,
        localKeyring: event.localKeyring,
      };
      return { ...updated, phase: evaluate(updated) };
    }

    case "LOCAL_KEYRING_LOADED":
      return {
        ...state,
        localKeyId: event.keyId,
        localKeyring: event.keyring,
        phase: "idle",
      };

    case "CLOUD_KEY_RESTORED":
      return {
        ...state,
        restoredCloudVaultKey: event.vaultKey,
        phase: "idle",
      };

    case "CLOUD_KEY_CACHED":
      return {
        ...state,
        hasCachedCloudKeys: true,
        phase: "idle",
      };
  }
}

export function useVaultMachine(): [
  { context: ActiveVaultState },
  (event: ActiveVaultEvent) => void,
] {
  const [state, dispatch] = useReducer(
    activeVaultReducer,
    initialState,
  );

  // Restore cloud key effect
  useEffect(() => {
    if (state.phase !== "restoringCloudKey") return;
    if (!state.vaultService) return;

    const { promise, cancel, signal } = createCancellableOperation(
      () => state.vaultService!.tryDeviceUnlockCloudKey(),
      { timeoutMs: 30000 },
    );

    void promise.then((result) => {
      if (!result || signal.aborted) return;
      dispatch({
        type: "CLOUD_KEY_RESTORED",
        vaultKey: result.vaultKey,
      });
    });

    return () => {
      cancel();
    };
  }, [state.phase, state.vaultService]);

  // Load local keyring effect
  useEffect(() => {
    if (state.phase !== "loadingLocalKeyring") return;
    if (!state.vaultKey) return;

    const localKey = state.vaultKey;
    const { promise, cancel, signal } = createCancellableOperation(
      async (abortSignal) => {
        const keyId = await computeKeyId(localKey);
        if (abortSignal.aborted) return null;

        const entries = new Map<string, CryptoKey>();
        entries.set(keyId, localKey);

        const extraKeys = listLocalKeyIds().filter(
          (id) => id !== keyId,
        );
        for (const id of extraKeys) {
          if (abortSignal.aborted) return null;
          try {
            const restored = await restoreLocalWrappedKey(
              id,
              localKey,
            );
            if (restored) {
              entries.set(id, restored);
            }
          } catch {
            // Ignore corrupted entries
          }
        }

        return { keyId, keyring: entries };
      },
      { timeoutMs: 30000 },
    );

    void promise.then((result) => {
      if (!result || signal.aborted) return;
      dispatch({
        type: "LOCAL_KEYRING_LOADED",
        keyId: result.keyId,
        keyring: result.keyring,
      });
    });

    return () => {
      cancel();
    };
  }, [state.phase, state.vaultKey]);

  // Cache cloud keys effect
  useEffect(() => {
    if (state.phase !== "cachingCloudKeys") return;
    if (!state.vaultKey) return;

    const localKey = state.vaultKey;
    const cloudKeyring = state.cloudKeyring;
    const localKeyId = state.localKeyId;
    const userId = state.authUserId;

    const { promise, cancel, signal } = createCancellableOperation(
      async (abortSignal) => {
        const cachedKeyIds: string[] = [];
        for (const [keyId, key] of cloudKeyring.entries()) {
          if (abortSignal.aborted) return false;
          if (keyId === localKeyId) continue;
          try {
            await storeLocalWrappedKey(keyId, key, localKey);
            cachedKeyIds.push(keyId);
          } catch (error) {
            console.warn(
              "Failed to cache cloud key locally:",
              error,
            );
          }
        }
        if (userId && cachedKeyIds.length) {
          rememberCloudKeyIds(userId, cachedKeyIds);
        }
        return true;
      },
      { timeoutMs: 30000 },
    );

    void promise.then((didCache) => {
      if (!didCache || signal.aborted) return;
      dispatch({ type: "CLOUD_KEY_CACHED" });
    });

    return () => {
      cancel();
    };
  }, [
    state.phase,
    state.vaultKey,
    state.cloudKeyring,
    state.localKeyId,
    state.authUserId,
  ]);

  const send = useCallback(
    (event: ActiveVaultEvent) => dispatch(event),
    [],
  );

  return [{ context: state }, send];
}
