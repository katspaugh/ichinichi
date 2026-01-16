import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMachine } from "@xstate/react";
import { assign, fromCallback, setup } from "xstate";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { useNoteContent } from "./useNoteContent";
import { useNoteDates } from "./useNoteDates";
import { useSync } from "./useSync";
import {
  createNoteRepository,
  createImageRepository,
  type SyncedRepositoryFactories,
} from "../domain/notes/repositoryFactory";
import type { E2eeServiceFactory } from "../domain/crypto/e2eeService";
import type { UnifiedSyncedNoteRepository } from "../domain/notes/hydratingSyncedNoteRepository";
import type { NoteRepository } from "../storage/noteRepository";
import type { ImageRepository } from "../storage/imageRepository";
import { AppMode } from "./useAppMode";
import { createHydratingSyncedNoteRepository } from "../domain/notes/hydratingSyncedNoteRepository";
import { createRemoteNotesGateway } from "../storage/remoteNotesGateway";
import { syncEncryptedImages } from "../storage/unifiedImageSyncService";
import { createUnifiedSyncedImageRepository } from "../storage/unifiedSyncedImageRepository";
import { createUnifiedSyncedNoteEnvelopeRepository } from "../storage/unifiedSyncedNoteRepository";
import { runtimeClock, runtimeConnectivity } from "../storage/runtimeAdapters";
import { syncStateStore } from "../storage/syncStateStore";
import { createE2eeService } from "../services/e2eeService";

const keyringTokenByKey = new WeakMap<CryptoKey, number>();
let keyringTokenSeed = 0;

function getKeyringToken(key: CryptoKey) {
  const existing = keyringTokenByKey.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const next = keyringTokenSeed + 1;
  keyringTokenSeed = next;
  keyringTokenByKey.set(key, next);
  return next;
}

function getKeyringSignature(keyring: Map<string, CryptoKey>) {
  if (!keyring.size) return "";
  return Array.from(keyring.entries())
    .map(([keyId, key]) => `${keyId}:${getKeyringToken(key)}`)
    .sort()
    .join("|");
}

const noteRepositoryCache = new Map<
  string,
  NoteRepository | UnifiedSyncedNoteRepository
>();
const imageRepositoryCache = new Map<string, ImageRepository>();

function getRepositoryCacheKey({
  kind,
  mode,
  userId,
  activeKeyId,
  vaultKey,
  keyringSignature,
}: {
  kind: "note" | "image";
  mode: AppMode;
  userId: string | null;
  activeKeyId: string;
  vaultKey: CryptoKey;
  keyringSignature: string;
}) {
  const vaultToken = getKeyringToken(vaultKey);
  const userToken = userId ?? "local";
  return `${kind}:${mode}:${userToken}:${activeKeyId}:${vaultToken}:${keyringSignature}`;
}

interface UseNoteRepositoryProps {
  mode: AppMode;
  authUser: User | null;
  supabaseClient: SupabaseClient;
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  activeKeyId: string | null;
  date: string | null;
  year: number;
}

export interface UseNoteRepositoryReturn {
  repository: NoteRepository | UnifiedSyncedNoteRepository | null;
  imageRepository: ImageRepository | null;
  syncedRepo: UnifiedSyncedNoteRepository | null;
  syncStatus: ReturnType<typeof useSync>["syncStatus"];
  syncError: ReturnType<typeof useSync>["syncError"];
  triggerSync: ReturnType<typeof useSync>["triggerSync"];
  queueIdleSync: ReturnType<typeof useSync>["queueIdleSync"];
  pendingOps: ReturnType<typeof useSync>["pendingOps"];
  capabilities: {
    canSync: boolean;
    canUploadImages: boolean;
  };
  content: string;
  setContent: (content: string) => void;
  hasEdits: boolean;
  /** True when the note is being saved (dirty or saving state) */
  isSaving: boolean;
  hasNote: (date: string) => boolean;
  noteDates: Set<string>;
  refreshNoteDates: (options?: { immediate?: boolean }) => void;
  isDecrypting: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
}

type NoteRepositoryEvent =
  | {
      type: "UPDATE_INPUTS";
      hasNote: (date: string) => boolean;
      refreshNoteDates: (options?: { immediate?: boolean }) => void;
      queueIdleSync: () => void;
    }
  | { type: "AFTER_SAVE"; date: string; isEmpty: boolean }
  | { type: "CLEAR_TIMER" };

interface NoteRepositoryContext {
  hasNote: (date: string) => boolean;
  refreshNoteDates: (options?: { immediate?: boolean }) => void;
  queueIdleSync: () => void;
  timerId: number | null;
}

const afterSaveActor = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: NoteRepositoryEvent) => void;
    input: {
      snapshot: { date: string; isEmpty: boolean };
      hasNote: (date: string) => boolean;
      refreshNoteDates: (options?: { immediate?: boolean }) => void;
    };
  }) => {
    const { snapshot, hasNote, refreshNoteDates } = input;
    const shouldRefresh = snapshot.isEmpty || !hasNote(snapshot.date);
    if (!shouldRefresh) {
      sendBack({ type: "CLEAR_TIMER" });
      return () => {};
    }
    const timer = window.setTimeout(() => {
      refreshNoteDates();
      sendBack({ type: "CLEAR_TIMER" });
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  },
);

const noteRepositoryMachine = setup({
  types: {
    context: {} as NoteRepositoryContext,
    events: {} as NoteRepositoryEvent,
  },
  actors: {
    afterSaveActor,
  },
  actions: {
    updateInputs: assign((args: { event: NoteRepositoryEvent }) => {
      const { event } = args;
      if (event.type !== "UPDATE_INPUTS") {
        return {};
      }
      return {
        hasNote: event.hasNote,
        refreshNoteDates: event.refreshNoteDates,
        queueIdleSync: event.queueIdleSync,
      };
    }),
    clearTimer: assign({ timerId: null }),
  },
}).createMachine({
  id: "noteRepository",
  initial: "idle",
  context: {
    hasNote: () => false,
    refreshNoteDates: () => {},
    queueIdleSync: () => {},
    timerId: null,
  },
  on: {
    UPDATE_INPUTS: {
      actions: "updateInputs",
    },
    CLEAR_TIMER: {
      actions: "clearTimer",
    },
  },
  states: {
    idle: {
      on: {
        AFTER_SAVE: {
          target: "refreshing",
        },
      },
    },
    refreshing: {
      invoke: {
        id: "afterSave",
        src: "afterSaveActor",
        input: ({
          context,
          event,
        }: {
          context: NoteRepositoryContext;
          event: NoteRepositoryEvent;
        }) => {
          if (event.type !== "AFTER_SAVE") {
            return {
              snapshot: { date: "", isEmpty: false },
              hasNote: context.hasNote,
              refreshNoteDates: context.refreshNoteDates,
            };
          }
          return {
            snapshot: { date: event.date, isEmpty: event.isEmpty },
            hasNote: context.hasNote,
            refreshNoteDates: context.refreshNoteDates,
          };
        },
      },
      on: {
        CLEAR_TIMER: {
          target: "idle",
        },
      },
    },
  },
});

export function useNoteRepository({
  mode,
  authUser,
  supabaseClient,
  vaultKey,
  keyring,
  activeKeyId,
  date,
  year,
}: UseNoteRepositoryProps): UseNoteRepositoryReturn {
  const userId = authUser?.id ?? null;
  const e2eeFactory = useMemo<E2eeServiceFactory>(
    () => ({
      create: createE2eeService,
    }),
    [],
  );
  const syncedFactories = useMemo<SyncedRepositoryFactories>(
    () => ({
      createSyncedNoteRepository: ({ userId, keyProvider }) => {
        const gateway = createRemoteNotesGateway(supabaseClient, userId);
        const envelopeRepo = createUnifiedSyncedNoteEnvelopeRepository(
          gateway,
          keyProvider.activeKeyId,
          () => syncEncryptedImages(supabaseClient, userId),
          runtimeConnectivity,
          runtimeClock,
          syncStateStore,
        );
        return createHydratingSyncedNoteRepository(
          envelopeRepo,
          keyProvider,
          e2eeFactory,
        );
      },
      createSyncedImageRepository: ({ userId, keyProvider }) =>
        createUnifiedSyncedImageRepository(supabaseClient, userId, keyProvider),
      e2eeFactory,
    }),
    [e2eeFactory, supabaseClient],
  );
  const keyringSignature = useMemo(
    () => getKeyringSignature(keyring),
    [keyring],
  );
  const repository = useMemo<
    NoteRepository | UnifiedSyncedNoteRepository | null
  >(() => {
    if (!vaultKey || !activeKeyId) return null;
    const cacheKey = getRepositoryCacheKey({
      kind: "note",
      mode,
      userId,
      activeKeyId,
      vaultKey,
      keyringSignature,
    });
    const cached = noteRepositoryCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const keyProvider = {
      activeKeyId,
      getKey: (keyId: string) => keyring.get(keyId) ?? null,
    };

    const created = createNoteRepository({
      mode,
      userId,
      keyProvider,
      syncedFactories,
    });
    noteRepositoryCache.set(cacheKey, created);
    return created;
  }, [
    mode,
    userId,
    vaultKey,
    activeKeyId,
    keyringSignature,
    keyring,
    syncedFactories,
  ]);

  const imageRepository = useMemo<ImageRepository | null>(() => {
    if (!vaultKey || !activeKeyId) return null;
    const cacheKey = getRepositoryCacheKey({
      kind: "image",
      mode,
      userId,
      activeKeyId,
      vaultKey,
      keyringSignature,
    });
    const cached = imageRepositoryCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const keyProvider = {
      activeKeyId,
      getKey: (keyId: string) => keyring.get(keyId) ?? null,
    };
    const created = createImageRepository({
      mode,
      userId,
      keyProvider,
      syncedFactories,
    });
    imageRepositoryCache.set(cacheKey, created);
    return created;
  }, [
    vaultKey,
    activeKeyId,
    mode,
    userId,
    keyringSignature,
    keyring,
    syncedFactories,
  ]);

  const syncedRepo =
    mode === AppMode.Cloud && userId
      ? (repository as UnifiedSyncedNoteRepository)
      : null;
  const syncEnabled =
    mode === AppMode.Cloud && !!userId && !!vaultKey && !!activeKeyId;
  const { syncStatus, syncError, triggerSync, queueIdleSync, pendingOps } =
    useSync(syncedRepo, { enabled: syncEnabled });
  const { hasNote, noteDates, refreshNoteDates } = useNoteDates(
    repository,
    year,
  );
  const capabilities = useMemo(
    () => ({
      canSync: !!syncedRepo,
      canUploadImages: !!imageRepository,
    }),
    [syncedRepo, imageRepository],
  );

  const [state, send] = useMachine(noteRepositoryMachine);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    send({ type: "UPDATE_INPUTS", hasNote, refreshNoteDates, queueIdleSync });
  }, [send, hasNote, refreshNoteDates, queueIdleSync]);

  useEffect(() => {
    if (state.context.timerId !== null) {
      timerRef.current = state.context.timerId;
    }
  }, [state.context.timerId]);

  const handleAfterSave = useCallback(
    (snapshot: { date: string; isEmpty: boolean }) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      send({
        type: "AFTER_SAVE",
        date: snapshot.date,
        isEmpty: snapshot.isEmpty,
      });
      queueIdleSync();
    },
    [send, queueIdleSync],
  );

  const {
    content,
    setContent,
    isDecrypting,
    hasEdits,
    isSaving,
    isContentReady,
    isOfflineStub,
  } = useNoteContent(date, repository, hasNote, handleAfterSave);

  return {
    repository,
    imageRepository,
    syncedRepo,
    syncStatus,
    syncError,
    triggerSync,
    queueIdleSync,
    pendingOps,
    capabilities,
    content,
    setContent,
    hasEdits,
    isSaving,
    hasNote,
    noteDates,
    refreshNoteDates,
    isDecrypting,
    isContentReady,
    isOfflineStub,
  };
}
