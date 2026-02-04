import {
  assign,
  enqueueActions,
  fromCallback,
  setup,
  sendTo,
  type ActorRefFrom,
} from "xstate";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { SyncStatus } from "../types";
import type { UnifiedSyncedNoteRepository } from "../domain/notes/hydratingSyncedNoteRepository";
import type { PendingOpsSummary, SyncService } from "../domain/sync";
import {
  createSyncIntentScheduler,
  createSyncService,
  getPendingOpsSummary,
} from "../domain/sync";
import { pendingOpsSource } from "../storage/pendingOpsSource";
import { createCancellableOperation } from "../utils/asyncHelpers";
import { formatSyncError } from "../utils/syncError";

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

export type SyncMachineEvent =
  | {
      type: "INPUTS_CHANGED";
      repository: UnifiedSyncedNoteRepository | null;
      enabled: boolean;
      online: boolean;
      userId: string | null;
      supabase: SupabaseClient | null;
    }
  | { type: "REQUEST_SYNC"; immediate?: boolean }
  | { type: "REQUEST_IDLE_SYNC"; delayMs?: number }
  | { type: "SYNC_REQUESTED"; intent: { immediate: boolean } }
  | { type: "SYNC_STARTED" }
  | { type: "SYNC_FINISHED"; status: SyncStatus }
  | { type: "SYNC_FAILED"; error: string }
  | { type: "PENDING_OPS_REFRESHED"; summary: PendingOpsSummary }
  | { type: "PENDING_OPS_FAILED" }
  | { type: "REALTIME_NOTE_CHANGED"; date: string }
  | { type: "REALTIME_CONNECTED" }
  | { type: "REALTIME_DISCONNECTED" };

interface SyncMachineContext {
  repository: UnifiedSyncedNoteRepository | null;
  enabled: boolean;
  online: boolean;
  userId: string | null;
  supabase: SupabaseClient | null;
  syncError: string | null;
  lastSynced: Date | null;
  pendingOps: PendingOpsSummary;
  status: SyncStatus;
  realtimeConnected: boolean;
}

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

  let currentSync: { cancel: () => void } | null = null;

  const runSyncNow = () => {
    if (currentSync) {
      currentSync.cancel();
    }
    const operation = createCancellableOperation(
      (signal) => {
        if (signal.aborted) {
          return Promise.resolve();
        }
        return syncService.syncNow();
      },
      {
        timeoutMs: 30000,
      },
    );
    currentSync = { cancel: operation.cancel };
    void operation.promise.finally(() => {
      if (currentSync?.cancel === operation.cancel) {
        currentSync = null;
      }
    });
  };

  receive((event) => {
    switch (event.type) {
      case "REQUEST_SYNC":
        intentScheduler.requestSync({ immediate: event.immediate });
        break;
      case "REQUEST_IDLE_SYNC":
        intentScheduler.requestIdleSync({ delayMs: event.delayMs });
        break;
      case "SYNC_NOW":
        runSyncNow();
        break;
    }
  });

  return () => {
    currentSync?.cancel();
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

type RealtimeActorEvent = { type: "START"; userId: string } | { type: "STOP" };

const realtimeActor = fromCallback<
  RealtimeActorEvent,
  { supabase: SupabaseClient | null }
>(({ sendBack, receive, input }) => {
  let channel: RealtimeChannel | null = null;
  let debounceTimer: number | null = null;
  const DEBOUNCE_MS = 500;

  receive((event) => {
    if (event.type === "START") {
      if (!input.supabase) return;
      channel = input.supabase
        .channel(`notes:${event.userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notes",
            filter: `user_id=eq.${event.userId}`,
          },
          (payload) => {
            const record = payload.new as { date?: string } | undefined;
            if (!record?.date) return;

            // Debounce rapid events
            if (debounceTimer) window.clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => {
              sendBack({ type: "REALTIME_NOTE_CHANGED", date: record.date! });
            }, DEBOUNCE_MS);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            sendBack({ type: "REALTIME_CONNECTED" });
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            sendBack({ type: "REALTIME_DISCONNECTED" });
          }
        });
    } else if (event.type === "STOP") {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      void channel?.unsubscribe();
      channel = null;
    }
  });

  return () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    void channel?.unsubscribe();
  };
});

type SyncResourcesActorRef = ActorRefFrom<typeof syncResourcesActor>;
type PendingOpsPollerActorRef = ActorRefFrom<typeof pendingOpsPollerActor>;
type RealtimeActorRef = ActorRefFrom<typeof realtimeActor>;

void (null as unknown as SyncResourcesActorRef);
void (null as unknown as PendingOpsPollerActorRef);
void (null as unknown as RealtimeActorRef);

export const syncMachine = setup({
  types: {
    context: {} as SyncMachineContext,
    events: {} as SyncMachineEvent,
  },
  actors: {
    syncResources: syncResourcesActor,
    pendingOpsPoller: pendingOpsPollerActor,
    realtimeActor: realtimeActor,
  },
}).createMachine({
  id: "sync",
  initial: "disabled",
  context: {
    repository: null,
    enabled: false,
    online: false,
    userId: null,
    supabase: null,
    syncError: null,
    lastSynced: null,
    pendingOps: initialPendingOps,
    status: SyncStatus.Idle,
    realtimeConnected: false,
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
              userId: event.userId,
              supabase: event.supabase,
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
              userId: event.userId,
              supabase: event.supabase,
              status: SyncStatus.Offline,
            })),
          },
          {
            target: "#initializing",
            actions: assign(({ event }) => ({
              repository: event.repository,
              enabled: event.enabled,
              online: event.online,
              userId: event.userId,
              supabase: event.supabase,
              status: SyncStatus.Idle,
            })),
          },
        ],
      },
    },
    active: {
      id: "active",
      entry: [
        assign({ syncError: null }),
        enqueueActions(({ enqueue, context }) => {
          if (context.userId) {
            enqueue(sendTo("realtimeActor", { type: "START", userId: context.userId }));
          }
        }),
      ],
      exit: enqueueActions(({ enqueue }) => {
        enqueue(sendTo("realtimeActor", { type: "STOP" }));
      }),
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
        {
          id: "realtimeActor",
          src: "realtimeActor",
          input: ({ context }) => ({
            supabase: context.supabase,
          }),
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
              userId: event.userId,
              supabase: event.supabase,
              pendingOps: initialPendingOps,
              syncError: null,
              status: SyncStatus.Idle,
              realtimeConnected: false,
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
              userId: event.userId,
              supabase: event.supabase,
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
              userId: event.userId,
              supabase: event.supabase,
              status: SyncStatus.Idle,
              syncError: null,
            })),
          },
          {
            actions: assign(({ event }) => ({
              repository: event.repository,
              enabled: event.enabled,
              online: event.online,
              userId: event.userId,
              supabase: event.supabase,
            })),
          },
        ],
        REQUEST_SYNC: {
          actions: enqueueActions(({ enqueue, event }) => {
            enqueue(
              sendTo("syncResources", {
                type: "REQUEST_SYNC",
                immediate: Boolean(event.immediate),
              }),
            );
          }),
        },
        REQUEST_IDLE_SYNC: {
          actions: enqueueActions(({ enqueue, event }) => {
            enqueue(sendTo("pendingOpsPoller", { type: "REFRESH" }));
            enqueue(
              sendTo("syncResources", {
                type: "REQUEST_IDLE_SYNC",
                delayMs: event.delayMs,
              }),
            );
          }),
        },
        SYNC_REQUESTED: {
          guard: ({ context }) => context.online,
          actions: enqueueActions(({ enqueue }) => {
            enqueue.assign({ status: SyncStatus.Syncing });
            enqueue(sendTo("syncResources", { type: "SYNC_NOW" }));
          }),
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
              enqueueActions(({ enqueue }) => {
                enqueue(sendTo("pendingOpsPoller", { type: "REFRESH" }));
              }),
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
              enqueueActions(({ enqueue }) => {
                enqueue(sendTo("pendingOpsPoller", { type: "REFRESH" }));
              }),
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
              enqueueActions(({ enqueue }) => {
                enqueue(sendTo("pendingOpsPoller", { type: "REFRESH" }));
              }),
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
            enqueueActions(({ enqueue }) => {
              enqueue(sendTo("pendingOpsPoller", { type: "REFRESH" }));
            }),
          ],
        },
        PENDING_OPS_REFRESHED: {
          actions: assign(({ event }) => ({ pendingOps: event.summary })),
        },
        PENDING_OPS_FAILED: {
          actions: assign({ pendingOps: initialPendingOps }),
        },
        REALTIME_NOTE_CHANGED: {
          actions: enqueueActions(({ enqueue }) => {
            enqueue(
              sendTo("syncResources", { type: "REQUEST_SYNC", immediate: true }),
            );
            enqueue(sendTo("pendingOpsPoller", { type: "REFRESH" }));
          }),
        },
        REALTIME_CONNECTED: {
          actions: [
            assign({ realtimeConnected: true }),
            // Sync on reconnect to catch missed events
            enqueueActions(({ enqueue }) => {
              enqueue(
                sendTo("syncResources", { type: "REQUEST_SYNC", immediate: true }),
              );
            }),
          ],
        },
        REALTIME_DISCONNECTED: {
          actions: assign({ realtimeConnected: false }),
        },
      },
      initial: "initializing",
      states: {
        initializing: {
          id: "initializing",
          entry: enqueueActions(({ enqueue }) => {
            enqueue(
              sendTo("syncResources", {
                type: "REQUEST_SYNC",
                immediate: true,
              }),
            );
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
