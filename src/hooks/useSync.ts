import { useCallback, useEffect } from "react";
import { useMachine } from "@xstate/react";
import { assign, fromCallback, sendTo, setup, type ActorRefFrom } from "xstate";
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

type SyncResourceEvent =
  | { type: "REQUEST_SYNC"; immediate: boolean }
  | { type: "REQUEST_IDLE_SYNC"; delayMs?: number }
  | { type: "SYNC_NOW" };

type PendingOpsPollerEvent = { type: "REFRESH" };

type SyncMachineEvent =
  | {
      type: "INPUTS_CHANGED";
      repository: UnifiedSyncedNoteRepository | null;
      enabled: boolean;
      online: boolean;
    }
  | { type: "REQUEST_SYNC"; immediate?: boolean }
  | { type: "REQUEST_IDLE_SYNC"; delayMs?: number }
  | { type: "SYNC_REQUESTED"; intent: { immediate: boolean } }
  | { type: "SYNC_STARTED" }
  | { type: "SYNC_FINISHED"; status: SyncStatus }
  | { type: "SYNC_FAILED"; error: string }
  | { type: "PENDING_OPS_REFRESHED"; summary: PendingOpsSummary }
  | { type: "PENDING_OPS_FAILED" };

interface SyncMachineContext {
  repository: UnifiedSyncedNoteRepository | null;
  enabled: boolean;
  online: boolean;
  syncError: string | null;
  lastSynced: Date | null;
  pendingOps: PendingOpsSummary;
  status: SyncStatus;
}

// Actor definitions - these need to be in setup() for invoke to work
const syncResourcesActor = fromCallback<
  SyncResourceEvent,
  { repository: UnifiedSyncedNoteRepository }
>(({ sendBack, receive, input }) => {
  const syncService: SyncService = createSyncService(
    input.repository,
    pendingOpsSource,
    {
      onSyncStart: () => {
        sendBack({ type: "SYNC_STARTED" });
      },
      onSyncComplete: (status) => {
        sendBack({ type: "SYNC_FINISHED", status });
      },
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
    }
  });

  return () => {
    syncService.dispose();
    intentScheduler.dispose();
  };
});

const pendingOpsPollerActor = fromCallback<PendingOpsPollerEvent>(
  ({ sendBack, receive }) => {
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

type SyncResourcesActorRef = ActorRefFrom<typeof syncResourcesActor>;
type PendingOpsPollerActorRef = ActorRefFrom<typeof pendingOpsPollerActor>;

// These type aliases are used for type inference with sendTo
void (null as unknown as SyncResourcesActorRef);
void (null as unknown as PendingOpsPollerActorRef);

export const syncMachine = setup({
  types: {
    context: {} as SyncMachineContext,
    events: {} as SyncMachineEvent,
  },
  actors: {
    syncResources: syncResourcesActor,
    pendingOpsPoller: pendingOpsPollerActor,
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
  states: {
    disabled: {
      id: "disabled",
      on: {
        INPUTS_CHANGED: [
          {
            guard: ({ event }) => !event.enabled || !event.repository,
            actions: assign(({ event }) => ({
              repository: event.repository,
              enabled: event.enabled,
              online: event.online,
            })),
          },
          {
            guard: ({ event }) =>
              event.enabled && !!event.repository && !event.online,
            target: "#offline",
            actions: assign(({ event }) => ({
              repository: event.repository,
              enabled: event.enabled,
              online: event.online,
              status: SyncStatus.Offline,
            })),
          },
          {
            target: "#initializing",
            actions: assign(({ event }) => ({
              repository: event.repository,
              enabled: event.enabled,
              online: event.online,
              status: SyncStatus.Idle,
            })),
          },
        ],
      },
    },
    active: {
      id: "active",
      entry: assign({ syncError: null }),
      invoke: [
        {
          id: "syncResources",
          src: "syncResources",
          input: ({ context }) => ({
            repository: context.repository as UnifiedSyncedNoteRepository,
          }),
        },
        {
          id: "pendingOpsPoller",
          src: "pendingOpsPoller",
        },
      ],
      on: {
        INPUTS_CHANGED: [
          {
            guard: ({ event }) => !event.enabled || !event.repository,
            target: "#disabled",
            actions: assign(({ event }) => ({
              repository: event.repository,
              enabled: event.enabled,
              online: event.online,
              pendingOps: initialPendingOps,
              syncError: null,
              status: SyncStatus.Idle,
            })),
          },
          {
            guard: ({ event }) =>
              event.enabled && !!event.repository && !event.online,
            target: "#offline",
            actions: assign(({ event }) => ({
              repository: event.repository,
              enabled: event.enabled,
              online: event.online,
              status: SyncStatus.Offline,
            })),
          },
          {
            guard: ({ context, event }) =>
              event.enabled &&
              !!event.repository &&
              event.online &&
              !context.online,
            target: "#initializing",
            actions: assign(({ event }) => ({
              repository: event.repository,
              enabled: event.enabled,
              online: event.online,
              status: SyncStatus.Idle,
              syncError: null,
            })),
          },
          {
            // Stay in current child state, just update inputs
            actions: assign(({ event }) => ({
              repository: event.repository,
              enabled: event.enabled,
              online: event.online,
            })),
          },
        ],
        REQUEST_SYNC: {
          actions: sendTo("syncResources", ({ event }) => ({
            type: "REQUEST_SYNC" as const,
            immediate: Boolean(event.immediate),
          })),
        },
        REQUEST_IDLE_SYNC: {
          actions: [
            sendTo("pendingOpsPoller", { type: "REFRESH" as const }),
            sendTo("syncResources", ({ event }) => ({
              type: "REQUEST_IDLE_SYNC" as const,
              delayMs: event.delayMs,
            })),
          ],
        },
        SYNC_REQUESTED: {
          guard: ({ context }) => context.online,
          actions: sendTo("syncResources", { type: "SYNC_NOW" as const }),
        },
        SYNC_STARTED: {
          target: "#syncing",
          actions: assign({ status: SyncStatus.Syncing }),
        },
        SYNC_FINISHED: [
          {
            guard: ({ event }) => event.status === SyncStatus.Offline,
            target: "#offline",
            actions: [
              assign(({ event, context }) => ({
                status: event.status,
                syncError: null,
                lastSynced:
                  event.status === SyncStatus.Synced
                    ? new Date()
                    : context.lastSynced,
              })),
              sendTo("pendingOpsPoller", { type: "REFRESH" as const }),
            ],
          },
          {
            guard: ({ event }) => event.status === SyncStatus.Error,
            target: "#error",
            actions: [
              assign(({ event, context }) => ({
                status: event.status,
                lastSynced:
                  event.status === SyncStatus.Synced
                    ? new Date()
                    : context.lastSynced,
              })),
              sendTo("pendingOpsPoller", { type: "REFRESH" as const }),
            ],
          },
          {
            target: "#ready",
            actions: [
              assign(({ event }) => ({
                status: event.status,
                syncError: null,
                lastSynced:
                  event.status === SyncStatus.Synced ? new Date() : null,
              })),
              sendTo("pendingOpsPoller", { type: "REFRESH" as const }),
            ],
          },
        ],
        SYNC_FAILED: {
          target: "#error",
          actions: [
            assign(({ event }) => ({
              status: SyncStatus.Error,
              syncError: event.error,
            })),
            sendTo("pendingOpsPoller", { type: "REFRESH" as const }),
          ],
        },
        PENDING_OPS_REFRESHED: {
          actions: assign(({ event }) => ({ pendingOps: event.summary })),
        },
        PENDING_OPS_FAILED: {
          actions: assign({ pendingOps: initialPendingOps }),
        },
      },
      initial: "initializing",
      states: {
        initializing: {
          id: "initializing",
          entry: sendTo("syncResources", {
            type: "REQUEST_SYNC" as const,
            immediate: true,
          }),
          always: { target: "#ready" },
        },
        offline: {
          id: "offline",
          entry: assign({ status: SyncStatus.Offline }),
        },
        ready: {
          id: "ready",
        },
        syncing: {
          id: "syncing",
        },
        error: {
          id: "error",
          entry: assign({ status: SyncStatus.Error }),
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
