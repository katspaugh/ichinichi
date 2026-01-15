import { useCallback, useEffect } from "react";
import { useMachine } from "@xstate/react";
import { assign, fromCallback, sendTo, setup } from "xstate";
import { SyncStatus } from "../types";
import type { UnifiedSyncedNoteRepository } from "../domain/notes/hydratingSyncedNoteRepository";
import type { PendingOpsSummary, SyncService } from "../domain/sync";
import {
  createSyncIntentScheduler,
  createSyncService,
  getPendingOpsSummary,
} from "../domain/sync";
import { useConnectivity } from "./useConnectivity";
import { pendingOpsSource } from "../storage/pendingOpsSource";
import { formatSyncError } from "../utils/syncError";

interface UseSyncReturn {
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSynced: Date | null;
  triggerSync: (options?: { immediate?: boolean }) => void;
  queueIdleSync: (options?: { delayMs?: number }) => void;
  pendingOps: PendingOpsSummary;
}

const initialPendingOps: PendingOpsSummary = {
  notes: 0,
  images: 0,
  total: 0,
};

type SyncInputsChangedEvent = {
  type: "INPUTS_CHANGED";
  repository: UnifiedSyncedNoteRepository | null;
  enabled: boolean;
  online: boolean;
};

type SyncMachineEvent =
  | SyncInputsChangedEvent
  | { type: "REQUEST_SYNC"; immediate?: boolean }
  | { type: "REQUEST_IDLE_SYNC"; delayMs?: number }
  | { type: "SYNC_REQUESTED"; intent: { immediate: boolean } }
  | { type: "SYNC_STARTED" }
  | { type: "SYNC_FINISHED"; status: SyncStatus }
  | { type: "SYNC_FAILED"; error: string }
  | { type: "PENDING_OPS_REFRESHED"; summary: PendingOpsSummary }
  | { type: "PENDING_OPS_FAILED" };

type SyncResourceEvent =
  | { type: "REQUEST_SYNC"; immediate: boolean }
  | { type: "REQUEST_IDLE_SYNC"; delayMs?: number }
  | { type: "SYNC_NOW" };

type PendingOpsPollerEvent = { type: "REFRESH" };

interface SyncMachineContext {
  repository: UnifiedSyncedNoteRepository | null;
  enabled: boolean;
  online: boolean;
  syncError: string | null;
  lastSynced: Date | null;
  pendingOps: PendingOpsSummary;
  status: SyncStatus;
}

const syncResources = fromCallback(
  ({
    sendBack,
    receive,
    input,
  }: {
    sendBack: (event: SyncMachineEvent) => void;
    receive: (listener: (event: SyncResourceEvent) => void) => void;
    input: { repository: UnifiedSyncedNoteRepository };
  }) => {
    const syncService: SyncService = createSyncService(
      input.repository,
      pendingOpsSource,
      {
        onSyncStart: () => sendBack({ type: "SYNC_STARTED" }),
        onSyncComplete: (status) => sendBack({ type: "SYNC_FINISHED", status }),
        onSyncError: (error) =>
          sendBack({
            type: "SYNC_FAILED",
            error: formatSyncError(error),
          }),
      },
    );

    const intentScheduler = createSyncIntentScheduler((event) => {
      if (event.type === "SYNC_REQUESTED") {
        sendBack({ type: "SYNC_REQUESTED", intent: event.intent });
      }
    }, pendingOpsSource);

    receive((event) => {
      switch (event.type) {
        case "REQUEST_SYNC":
          intentScheduler.requestSync({ immediate: event.immediate });
          break;
        case "REQUEST_IDLE_SYNC":
          intentScheduler.requestIdleSync({ delayMs: event.delayMs });
          break;
        case "SYNC_NOW":
          void syncService.syncNow();
          break;
        default:
          break;
      }
    });

    return () => {
      syncService.dispose();
      intentScheduler.dispose();
    };
  },
);

const pendingOpsPoller = fromCallback(
  ({
    sendBack,
    receive,
  }: {
    sendBack: (event: SyncMachineEvent) => void;
    receive: (listener: (event: PendingOpsPollerEvent) => void) => void;
  }) => {
    let disposed = false;
    const refresh = async () => {
      try {
        const summary = await getPendingOpsSummary(pendingOpsSource);
        if (!disposed) {
          sendBack({ type: "PENDING_OPS_REFRESHED", summary });
        }
      } catch {
        if (!disposed) {
          sendBack({ type: "PENDING_OPS_FAILED" });
        }
      }
    };

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, 5000);

    receive((event) => {
      if (event.type === "REFRESH") {
        void refresh();
      }
    });

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  },
);

const syncMachine = setup({
  types: {
    context: {} as SyncMachineContext,
    events: {} as SyncMachineEvent,
  },
  actors: {
    syncResources,
    pendingOpsPoller,
  },
  actions: {
    updateInputs: assign((args: { event: SyncMachineEvent }) => {
      const { event } = args;
      if (event.type !== "INPUTS_CHANGED") {
        return {};
      }
      return {
        repository: event.repository,
        enabled: event.enabled,
        online: event.online,
      };
    }),
    resetPendingOps: assign({ pendingOps: initialPendingOps }),
    setPendingOps: assign((args: { event: SyncMachineEvent }) => {
      const { event } = args;
      return event.type === "PENDING_OPS_REFRESHED"
        ? { pendingOps: event.summary }
        : {};
    }),
    clearSyncError: assign({ syncError: null }),
    setStatusIdle: assign({ status: SyncStatus.Idle }),
    setStatusOffline: assign({ status: SyncStatus.Offline }),
    setStatusSyncing: assign({ status: SyncStatus.Syncing }),
    setStatusError: assign({ status: SyncStatus.Error }),
    requestImmediateSync: sendTo("syncResources", {
      type: "REQUEST_SYNC",
      immediate: true,
    }),
    requestSync: sendTo(
      "syncResources",
      (args: { event: SyncMachineEvent }) => {
        const { event } = args;
        if (event.type !== "REQUEST_SYNC") {
          return { type: "REQUEST_SYNC", immediate: false };
        }
        return { type: "REQUEST_SYNC", immediate: Boolean(event.immediate) };
      },
    ),
    requestIdleSync: sendTo(
      "syncResources",
      (args: { event: SyncMachineEvent }) => {
        const { event } = args;
        if (event.type !== "REQUEST_IDLE_SYNC") {
          return { type: "REQUEST_IDLE_SYNC" };
        }
        return { type: "REQUEST_IDLE_SYNC", delayMs: event.delayMs };
      },
    ),
    dispatchSync: sendTo("syncResources", { type: "SYNC_NOW" }),
    refreshPendingOps: sendTo("pendingOpsPoller", { type: "REFRESH" }),
    applySyncFinished: assign(
      (args: { event: SyncMachineEvent; context: SyncMachineContext }) => {
        const { event, context } = args;
        if (event.type !== "SYNC_FINISHED") {
          return {};
        }
        const next: Partial<SyncMachineContext> = {
          status: event.status,
        };
        if (event.status === SyncStatus.Synced) {
          next.lastSynced = new Date();
          next.syncError = null;
        } else if (event.status !== SyncStatus.Error) {
          next.syncError = null;
        } else {
          next.syncError = context.syncError;
        }
        return next;
      },
    ),
    applySyncFailed: assign((args: { event: SyncMachineEvent }) => {
      const { event } = args;
      if (event.type !== "SYNC_FAILED") {
        return {};
      }
      return {
        status: SyncStatus.Error,
        syncError: event.error,
      };
    }),
  },
  guards: {
    shouldDisable: ({ event }: { event: SyncMachineEvent }) =>
      event.type === "INPUTS_CHANGED" && (!event.enabled || !event.repository),
    shouldGoOffline: ({ event }: { event: SyncMachineEvent }) =>
      event.type === "INPUTS_CHANGED" &&
      event.enabled &&
      !!event.repository &&
      !event.online,
    isOnline: ({ context }: { context: SyncMachineContext }) => context.online,
    isStatusOffline: ({ event }: { event: SyncMachineEvent }) =>
      event.type === "SYNC_FINISHED" && event.status === SyncStatus.Offline,
    isStatusError: ({ event }: { event: SyncMachineEvent }) =>
      event.type === "SYNC_FINISHED" && event.status === SyncStatus.Error,
  },
}).createMachine({
  id: "sync",
  initial: "disabled",
  context: {
    repository: null,
    enabled: false,
    online: false,
    syncError: null,
    lastSynced: null,
    pendingOps: initialPendingOps,
    status: SyncStatus.Idle,
  },
  on: {
    INPUTS_CHANGED: [
      {
        guard: "shouldDisable",
        target: "disabled",
        actions: [
          "updateInputs",
          "resetPendingOps",
          "clearSyncError",
          "setStatusIdle",
        ],
      },
      {
        guard: "shouldGoOffline",
        target: "active.offline",
        reenter: true,
        actions: ["updateInputs", "setStatusOffline"],
      },
      {
        target: "active.ready",
        reenter: true,
        actions: ["updateInputs", "setStatusIdle", "requestImmediateSync"],
      },
    ],
  },
  states: {
    disabled: {},
    active: {
      entry: "clearSyncError",
      invoke: [
        {
          id: "syncResources",
          src: "syncResources",
          input: ({ context }: { context: SyncMachineContext }) => ({
            repository: context.repository as UnifiedSyncedNoteRepository,
          }),
        },
        {
          id: "pendingOpsPoller",
          src: "pendingOpsPoller",
        },
      ],
      on: {
        REQUEST_SYNC: {
          actions: "requestSync",
        },
        REQUEST_IDLE_SYNC: {
          actions: "requestIdleSync",
        },
        SYNC_REQUESTED: {
          guard: "isOnline",
          actions: "dispatchSync",
        },
        SYNC_STARTED: {
          target: ".syncing",
          actions: "setStatusSyncing",
        },
        SYNC_FINISHED: [
          {
            guard: "isStatusOffline",
            target: ".offline",
            actions: ["applySyncFinished", "refreshPendingOps"],
          },
          {
            guard: "isStatusError",
            target: ".error",
            actions: ["applySyncFinished", "refreshPendingOps"],
          },
          {
            target: ".ready",
            actions: ["applySyncFinished", "refreshPendingOps"],
          },
        ],
        SYNC_FAILED: {
          target: ".error",
          actions: ["applySyncFailed", "refreshPendingOps"],
        },
        PENDING_OPS_REFRESHED: {
          actions: "setPendingOps",
        },
        PENDING_OPS_FAILED: {
          actions: "resetPendingOps",
        },
      },
      initial: "ready",
      states: {
        offline: {
          entry: "setStatusOffline",
        },
        ready: {},
        syncing: {},
        error: {
          entry: "setStatusError",
        },
      },
    },
  },
});

export function useSync(
  repository: UnifiedSyncedNoteRepository | null,
  options?: { enabled?: boolean },
): UseSyncReturn {
  const online = useConnectivity();
  const syncEnabled = options?.enabled ?? !!repository;
  const [state, send] = useMachine(syncMachine);

  useEffect(() => {
    send({
      type: "INPUTS_CHANGED",
      repository,
      enabled: syncEnabled,
      online,
    });
  }, [send, repository, syncEnabled, online]);

  const triggerSync = useCallback(
    (options?: { immediate?: boolean }) => {
      send({ type: "REQUEST_SYNC", immediate: Boolean(options?.immediate) });
    },
    [send],
  );

  const queueIdleSync = useCallback(
    (options?: { delayMs?: number }) => {
      send({ type: "REQUEST_IDLE_SYNC", delayMs: options?.delayMs });
    },
    [send],
  );

  return {
    syncStatus: state.context.status,
    syncError: state.context.syncError,
    lastSynced: state.context.lastSynced,
    triggerSync,
    queueIdleSync,
    pendingOps: state.context.pendingOps,
  };
}
