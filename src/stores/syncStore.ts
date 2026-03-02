import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
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
import { connectivity } from "../services/connectivity";

const initialPendingOps: PendingOpsSummary = {
  notes: 0,
  images: 0,
  total: 0,
};

const PERIODIC_SYNC_INTERVAL_MS = 30_000;
const PENDING_OPS_POLL_MS = 5_000;
const REALTIME_RETRY_MS = 5_000;
const REALTIME_DEBOUNCE_MS = 500;

export interface SyncStoreState {
  status: SyncStatus;
  syncError: string | null;
  lastSynced: Date | null;
  syncCompletionCount: number;
  pendingOps: PendingOpsSummary;
  realtimeConnected: boolean;
  lastRealtimeChangedDate: string | null;
  enabled: boolean;
  online: boolean;

  // Actions
  init: (config: {
    repository: UnifiedSyncedNoteRepository;
    userId: string;
    supabase: SupabaseClient;
  }) => void;
  dispose: () => void;
  updateConnectivity: (online: boolean) => void;
  requestSync: (options?: { immediate?: boolean }) => void;
  queueIdleSync: (options?: { delayMs?: number }) => void;
  clearRealtimeChanged: () => void;
  handleWindowFocus: () => void;

  // Internal handles (not consumed by UI)
  _syncService: SyncService | null;
  _intentScheduler: ReturnType<typeof createSyncIntentScheduler> | null;
  _realtimeChannel: RealtimeChannel | null;
  _periodicSyncTimer: number | null;
  _pendingOpsTimer: number | null;
  _unsubConnectivity: (() => void) | null;
  _disposed: boolean;
  _currentSync: { cancel: () => void } | null;
}

export const syncStore = createStore<SyncStoreState>()(subscribeWithSelector((set, get) => {
  // --- internal helpers ---

  let _realtimeDebounceTimer: number | null = null;
  let _realtimeRetryTimer: number | null = null;

  const _refreshPendingOps = async () => {
    try {
      const summary = await getPendingOpsSummary(pendingOpsSource);
      if (!get()._disposed) {
        set({ pendingOps: summary });
      }
    } catch {
      if (!get()._disposed) {
        set({ pendingOps: initialPendingOps });
      }
    }
  };

  const _runSyncNow = () => {
    const state = get();
    if (!state._syncService || !state.online) return;

    if (state._currentSync) {
      state._currentSync.cancel();
    }

    const operation = createCancellableOperation(
      (signal) => {
        if (signal.aborted) return Promise.resolve();
        return state._syncService!.syncNow();
      },
      { timeoutMs: 30000 },
    );

    set({ _currentSync: { cancel: operation.cancel } });
    void operation.promise.finally(() => {
      if (get()._currentSync?.cancel === operation.cancel) {
        set({ _currentSync: null });
      }
    });
  };

  const _subscribeRealtime = (
    supabase: SupabaseClient,
    userId: string,
  ) => {
    // Clean up previous
    const prev = get()._realtimeChannel;
    if (prev) void prev.unsubscribe();

    const channel = supabase
      .channel(`notes:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const record = payload.new as { date?: string } | undefined;
          if (!record?.date) return;

          if (_realtimeDebounceTimer) window.clearTimeout(_realtimeDebounceTimer);
          _realtimeDebounceTimer = window.setTimeout(() => {
            _realtimeDebounceTimer = null;
            if (get()._disposed) return;
            set({ lastRealtimeChangedDate: record.date! });
            // Also request a sync on realtime change
            get().requestSync({ immediate: true });
            void _refreshPendingOps();
          }, REALTIME_DEBOUNCE_MS);
        },
      )
      .subscribe((status) => {
        if (get()._disposed) return;
        if (status === "SUBSCRIBED") {
          set({ realtimeConnected: true });
          // Sync on reconnect to catch missed events
          get().requestSync({ immediate: true });
        } else if (
          status === "CLOSED" ||
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          set({ realtimeConnected: false });
          if (_realtimeRetryTimer) window.clearTimeout(_realtimeRetryTimer);
          _realtimeRetryTimer = window.setTimeout(() => {
            _realtimeRetryTimer = null;
            if (!get()._disposed) {
              _subscribeRealtime(supabase, userId);
            }
          }, REALTIME_RETRY_MS);
        }
      });

    set({ _realtimeChannel: channel });
  };

  // Visibility/focus handlers stored so we can remove them
  let _handleVisibilityChange: (() => void) | null = null;
  let _handleFocus: (() => void) | null = null;

  return {
    // Initial state
    status: SyncStatus.Idle,
    syncError: null,
    lastSynced: null,
    syncCompletionCount: 0,
    pendingOps: initialPendingOps,
    realtimeConnected: false,
    lastRealtimeChangedDate: null,
    enabled: false,
    online: connectivity.getOnline(),
    _syncService: null,
    _intentScheduler: null,
    _realtimeChannel: null,
    _periodicSyncTimer: null,
    _pendingOpsTimer: null,
    _unsubConnectivity: null,
    _disposed: true,
    _currentSync: null,

    init: (config) => {
      // Dispose previous if any
      const prev = get();
      if (!prev._disposed) {
        get().dispose();
      }

      const online = connectivity.getOnline();

      // Create sync service reusing domain code
      const syncService = createSyncService(
        config.repository,
        pendingOpsSource,
        {
          onSyncStart: () => {
            set({ status: SyncStatus.Syncing });
          },
          onSyncComplete: (status) => {
            const s = get();
            set({
              status,
              syncError: null,
              lastSynced:
                status === SyncStatus.Synced ? new Date() : s.lastSynced,
              syncCompletionCount: s.syncCompletionCount + 1,
            });
            void _refreshPendingOps();
          },
          onSyncError: (error) => {
            const s = get();
            set({
              status: SyncStatus.Error,
              syncError: formatSyncError(error),
              syncCompletionCount: s.syncCompletionCount + 1,
            });
            void _refreshPendingOps();
          },
        },
      );

      // Create intent scheduler — dispatch events directly
      const intentScheduler = createSyncIntentScheduler((event) => {
        if (event.type === "SYNC_REQUESTED" && get().online) {
          _runSyncNow();
        }
      }, pendingOpsSource);

      // Periodic sync
      const periodicSyncTimer = window.setInterval(() => {
        if (!get()._disposed && get().online) {
          intentScheduler.requestSync({ immediate: true });
        }
      }, PERIODIC_SYNC_INTERVAL_MS);

      // Pending ops poller
      void _refreshPendingOps();
      const pendingOpsTimer = window.setInterval(() => {
        if (!get()._disposed) {
          void _refreshPendingOps();
        }
      }, PENDING_OPS_POLL_MS);

      // Connectivity subscription
      const unsubConnectivity = connectivity.subscribe((nowOnline) => {
        get().updateConnectivity(nowOnline);
      });

      // Window focus/visibility handlers
      _handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          get().handleWindowFocus();
        }
      };
      _handleFocus = () => {
        get().handleWindowFocus();
      };
      document.addEventListener("visibilitychange", _handleVisibilityChange);
      window.addEventListener("focus", _handleFocus);

      set({
        _syncService: syncService,
        _intentScheduler: intentScheduler,
        _periodicSyncTimer: periodicSyncTimer,
        _pendingOpsTimer: pendingOpsTimer,
        _unsubConnectivity: unsubConnectivity,
        _disposed: false,
        enabled: true,
        online,
        status: online ? SyncStatus.Idle : SyncStatus.Offline,
        syncError: null,
      });

      // Realtime subscription
      _subscribeRealtime(config.supabase, config.userId);

      // Initial sync
      if (online) {
        intentScheduler.requestSync({ immediate: true });
      }
    },

    dispose: () => {
      const state = get();
      if (state._disposed) return;

      // Remove window listeners
      if (_handleVisibilityChange) {
        document.removeEventListener("visibilitychange", _handleVisibilityChange);
        _handleVisibilityChange = null;
      }
      if (_handleFocus) {
        window.removeEventListener("focus", _handleFocus);
        _handleFocus = null;
      }

      state._currentSync?.cancel();
      state._syncService?.dispose();
      state._intentScheduler?.dispose();

      if (state._realtimeChannel) {
        void state._realtimeChannel.unsubscribe();
      }
      if (state._periodicSyncTimer !== null) {
        window.clearInterval(state._periodicSyncTimer);
      }
      if (state._pendingOpsTimer !== null) {
        window.clearInterval(state._pendingOpsTimer);
      }
      if (state._unsubConnectivity) {
        state._unsubConnectivity();
      }
      if (_realtimeDebounceTimer) {
        window.clearTimeout(_realtimeDebounceTimer);
        _realtimeDebounceTimer = null;
      }
      if (_realtimeRetryTimer) {
        window.clearTimeout(_realtimeRetryTimer);
        _realtimeRetryTimer = null;
      }

      set({
        _syncService: null,
        _intentScheduler: null,
        _realtimeChannel: null,
        _periodicSyncTimer: null,
        _pendingOpsTimer: null,
        _unsubConnectivity: null,
        _disposed: true,
        _currentSync: null,
        enabled: false,
        status: SyncStatus.Idle,
        syncError: null,
        pendingOps: initialPendingOps,
        realtimeConnected: false,
        lastRealtimeChangedDate: null,
        syncCompletionCount: 0,
      });
    },

    updateConnectivity: (online) => {
      const prev = get();
      if (prev.online === online) return;
      set({ online });

      if (online && !prev._disposed) {
        // Coming online — trigger sync
        set({ status: SyncStatus.Idle, syncError: null });
        prev._intentScheduler?.requestSync({ immediate: true });
      } else if (!online && !prev._disposed) {
        set({ status: SyncStatus.Offline });
      }
    },

    requestSync: (options) => {
      const state = get();
      if (state._disposed || !state._intentScheduler) return;
      state._intentScheduler.requestSync({
        immediate: Boolean(options?.immediate),
      });
    },

    queueIdleSync: (options) => {
      const state = get();
      if (state._disposed || !state._intentScheduler) return;
      void _refreshPendingOps();
      state._intentScheduler.requestIdleSync({
        delayMs: options?.delayMs,
      });
    },

    clearRealtimeChanged: () => {
      set({ lastRealtimeChangedDate: null });
    },

    handleWindowFocus: () => {
      const state = get();
      if (state._disposed || !state._intentScheduler) return;
      state._intentScheduler.requestSync({ immediate: true });
      void _refreshPendingOps();
    },
  };
}));
