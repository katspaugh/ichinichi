import { useCallback, useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { assign, fromCallback, setup } from "xstate";
import type { Note } from "../types";
import type { NoteRepository } from "../storage/noteRepository";
import type { RepositoryError } from "../domain/errors";
import type { Result } from "../domain/result";
import { useConnectivity } from "./useConnectivity";

type NoteRefreshResult = Result<Note | null, RepositoryError> | Note | null;

interface RefreshableNoteRepository {
  refreshNote: (date: string) => Promise<NoteRefreshResult>;
}

interface RemoteIndexRepository {
  hasRemoteDateCached: (date: string) => Promise<boolean>;
}

interface PendingOpRepository {
  hasPendingOp: (date: string) => Promise<boolean>;
}

function canRefresh(
  repository: NoteRepository,
): repository is NoteRepository & RefreshableNoteRepository {
  return (
    "refreshNote" in repository && typeof repository.refreshNote === "function"
  );
}

function hasRemoteIndex(
  repository: NoteRepository,
): repository is NoteRepository & RemoteIndexRepository {
  return (
    "hasRemoteDateCached" in repository &&
    typeof repository.hasRemoteDateCached === "function"
  );
}

function hasPendingOps(
  repository: NoteRepository,
): repository is NoteRepository & PendingOpRepository {
  return (
    "hasPendingOp" in repository &&
    typeof repository.hasPendingOp === "function"
  );
}

function unwrapRefreshResult(result: NoteRefreshResult): Note | null {
  if (!result) return null;
  if (typeof result === "object" && "ok" in result) {
    return result.ok ? result.value : null;
  }
  return result;
}

export interface UseNoteRemoteSyncReturn {
  /** Whether there's a known remote note that we can't access offline */
  isKnownRemoteOnly: boolean;
  /** Trigger a background refresh from remote */
  triggerRefresh: () => void;
  /** Force a refresh even if already refreshed for this date (used for realtime updates) */
  forceRefresh: () => void;
}

interface UseNoteRemoteSyncOptions {
  /** Called when remote has updated content */
  onRemoteUpdate?: (content: string) => void;
  /** Current local content (used to avoid redundant updates) */
  localContent: string;
  /** Whether local has unsaved edits (skip sync if true) */
  hasLocalEdits: boolean;
  /** Whether local content is ready (only sync after local load completes) */
  isLocalReady: boolean;
}

type RemoteSyncEvent =
  | {
      type: "INPUTS_CHANGED";
      date: string | null;
      repository: NoteRepository | null;
      online: boolean;
      localContent: string;
      hasLocalEdits: boolean;
      isLocalReady: boolean;
    }
  | { type: "REMOTE_CACHE_READY"; date: string; hasRemote: boolean }
  | { type: "REMOTE_REFRESHED"; content: string }
  | { type: "CHECK_DONE" }
  | { type: "CLEAR_PENDING_REMOTE" }
  | { type: "FORCE_REFRESH" };

interface RemoteSyncContext {
  date: string | null;
  repository: NoteRepository | null;
  online: boolean;
  localContent: string;
  hasLocalEdits: boolean;
  isLocalReady: boolean;
  remoteCacheResult: { date: string; hasRemote: boolean } | null;
  pendingRemoteContent: string | null;
  /** Tracks whether we've already refreshed for the current date (prevents re-refresh on every edit) */
  hasRefreshedForDate: string | null;
}

const remoteCacheCheck = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: RemoteSyncEvent) => void;
    input: { date: string; repository: NoteRepository };
  }) => {
    let cancelled = false;

    const check = async () => {
      try {
        if (!hasRemoteIndex(input.repository)) {
          sendBack({ type: "CHECK_DONE" });
          return;
        }
        const hasRemote = await input.repository.hasRemoteDateCached(
          input.date,
        );
        if (!cancelled) {
          sendBack({ type: "REMOTE_CACHE_READY", date: input.date, hasRemote });
        }
      } catch (error) {
        console.error("Failed to check remote date cache:", error);
        if (!cancelled) {
          sendBack({ type: "CHECK_DONE" });
        }
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  },
);

const remoteRefresh = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: RemoteSyncEvent) => void;
    input: {
      date: string;
      repository: NoteRepository;
      localContent: string;
      hasLocalEdits: boolean;
    };
  }) => {
    let cancelled = false;

    const refresh = async () => {
      try {
        if (!canRefresh(input.repository)) {
          return;
        }
        const remoteResult = await input.repository.refreshNote(input.date);
        if (cancelled) return;
        const remoteNote = unwrapRefreshResult(remoteResult);
        if (!remoteNote) return;

        if (hasPendingOps(input.repository)) {
          const hasPending = await input.repository.hasPendingOp(input.date);
          if (hasPending) return;
        }

        if (input.hasLocalEdits) return;

        const remoteContent = remoteNote.content ?? "";
        if (remoteContent !== input.localContent) {
          sendBack({ type: "REMOTE_REFRESHED", content: remoteContent });
        }
      } catch (error) {
        console.error("Failed to refresh note from remote:", error);
      }
    };

    void refresh();

    return () => {
      cancelled = true;
    };
  },
);

const remoteSyncMachine = setup({
  types: {
    context: {} as RemoteSyncContext,
    events: {} as RemoteSyncEvent,
  },
  actors: {
    remoteCacheCheck,
    remoteRefresh,
  },
  actions: {
    applyInputs: assign(
      (args: { event: RemoteSyncEvent; context: RemoteSyncContext }) => {
        const { event, context } = args;
      if (event.type !== "INPUTS_CHANGED") {
        return {};
      }
      const repositoryChanged = event.repository !== context.repository;
      const dateChanged = event.date !== context.date;
      const shouldResetRefresh =
        repositoryChanged || dateChanged || !event.repository || !event.date;
      return {
        date: event.date,
        repository: event.repository,
        online: event.online,
        localContent: event.localContent,
        hasLocalEdits: event.hasLocalEdits,
        isLocalReady: event.isLocalReady,
        hasRefreshedForDate: shouldResetRefresh
          ? null
          : context.hasRefreshedForDate,
        remoteCacheResult:
          repositoryChanged || dateChanged ? null : context.remoteCacheResult,
      };
    }),
    applyRemoteCache: assign((args: { event: RemoteSyncEvent }) => {
      const { event } = args;
      if (event.type !== "REMOTE_CACHE_READY") {
        return {};
      }
      return {
        remoteCacheResult: { date: event.date, hasRemote: event.hasRemote },
      };
    }),
    setPendingRemoteContent: assign((args: { event: RemoteSyncEvent }) => {
      const { event } = args;
      if (event.type !== "REMOTE_REFRESHED") {
        return {};
      }
      return { pendingRemoteContent: event.content };
    }),
    clearPendingRemoteContent: assign({ pendingRemoteContent: null }),
    markRefreshed: assign(({ context }: { context: RemoteSyncContext }) => ({
      hasRefreshedForDate: context.date,
    })),
    clearRefreshedFlag: assign({ hasRefreshedForDate: null }),
  },
  guards: {
    shouldCheckRemoteCache: ({ context }: { context: RemoteSyncContext }) =>
      !!context.date &&
      !!context.repository &&
      context.isLocalReady &&
      !context.online &&
      context.localContent === "" &&
      hasRemoteIndex(context.repository),
    shouldRefresh: ({ context }: { context: RemoteSyncContext }) =>
      !!context.date &&
      !!context.repository &&
      canRefresh(context.repository) &&
      context.online &&
      context.isLocalReady &&
      context.hasRefreshedForDate !== context.date,
  },
}).createMachine({
  id: "noteRemoteSync",
  initial: "idle",
  context: {
    date: null,
    repository: null,
    online: false,
    localContent: "",
    hasLocalEdits: false,
    isLocalReady: false,
    remoteCacheResult: null,
    pendingRemoteContent: null,
    hasRefreshedForDate: null,
  },
  on: {
    INPUTS_CHANGED: {
      actions: "applyInputs",
      target: ".decide",
    },
    CLEAR_PENDING_REMOTE: {
      actions: "clearPendingRemoteContent",
    },
    FORCE_REFRESH: {
      actions: "clearRefreshedFlag",
      target: ".decide",
    },
  },
  states: {
    idle: {},
    decide: {
      always: [
        {
          guard: "shouldCheckRemoteCache",
          target: "checkingCache",
        },
        {
          guard: "shouldRefresh",
          target: "refreshing",
        },
        {
          target: "idle",
        },
      ],
    },
    checkingCache: {
      invoke: {
        id: "remoteCacheCheck",
        src: "remoteCacheCheck",
        input: ({ context }: { context: RemoteSyncContext }) => ({
          date: context.date as string,
          repository: context.repository as NoteRepository,
        }),
      },
      on: {
        REMOTE_CACHE_READY: {
          target: "idle",
          actions: "applyRemoteCache",
        },
        CHECK_DONE: {
          target: "idle",
        },
        INPUTS_CHANGED: {
          target: "decide",
          actions: "applyInputs",
        },
      },
    },
    refreshing: {
      entry: "markRefreshed",
      invoke: {
        id: "remoteRefresh",
        src: "remoteRefresh",
        input: ({ context }: { context: RemoteSyncContext }) => ({
          date: context.date as string,
          repository: context.repository as NoteRepository,
          localContent: context.localContent,
          hasLocalEdits: context.hasLocalEdits,
        }),
      },
      on: {
        REMOTE_REFRESHED: {
          target: "idle",
          actions: "setPendingRemoteContent",
        },
        INPUTS_CHANGED: {
          target: "decide",
          actions: "applyInputs",
        },
      },
    },
  },
});

/**
 * Hook for syncing note content with remote server.
 * This hook handles all network-related operations.
 */
export function useNoteRemoteSync(
  date: string | null,
  repository: NoteRepository | null,
  options: UseNoteRemoteSyncOptions,
): UseNoteRemoteSyncReturn {
  const { onRemoteUpdate, localContent, hasLocalEdits, isLocalReady } = options;
  const online = useConnectivity();
  const localContentRef = useRef(localContent);
  const hasLocalEditsRef = useRef(hasLocalEdits);
  const onRemoteUpdateRef = useRef(onRemoteUpdate);

  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);

  useEffect(() => {
    hasLocalEditsRef.current = hasLocalEdits;
  }, [hasLocalEdits]);

  useEffect(() => {
    onRemoteUpdateRef.current = onRemoteUpdate;
  }, [onRemoteUpdate]);

  const [state, send] = useMachine(remoteSyncMachine);

  useEffect(() => {
    send({
      type: "INPUTS_CHANGED",
      date,
      repository,
      online,
      localContent,
      hasLocalEdits,
      isLocalReady,
    });
  }, [
    send,
    date,
    repository,
    online,
    localContent,
    hasLocalEdits,
    isLocalReady,
  ]);

  const triggerRefresh = useCallback(() => {
    send({
      type: "INPUTS_CHANGED",
      date,
      repository,
      online,
      localContent: localContentRef.current,
      hasLocalEdits: hasLocalEditsRef.current,
      isLocalReady,
    });
  }, [send, date, repository, online, isLocalReady]);

  const forceRefresh = useCallback(() => {
    send({ type: "FORCE_REFRESH" });
  }, [send]);

  useEffect(() => {
    const pending = state.context.pendingRemoteContent;
    if (!pending) return;
    onRemoteUpdateRef.current?.(pending);
    send({ type: "CLEAR_PENDING_REMOTE" });
  }, [state.context.pendingRemoteContent, send]);

  const isKnownRemoteOnly =
    !online &&
    localContent === "" &&
    isLocalReady &&
    state.context.remoteCacheResult !== null &&
    state.context.remoteCacheResult.date === date &&
    state.context.remoteCacheResult.hasRemote;

  return {
    isKnownRemoteOnly,
    triggerRefresh,
    forceRefresh,
  };
}
