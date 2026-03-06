import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useNoteContent } from "./useNoteContent";
import { useNoteDates } from "./useNoteDates";
import { useSync } from "./useSync";
import {
  createNoteRepository,
  createImageRepository,
  type SyncedRepositoryFactories,
} from "../domain/notes/repositoryFactory";
import type { NoteRepository } from "../storage/noteRepository";
import type { ImageRepository } from "../storage/imageRepository";
import { AppMode } from "./useAppMode";
import { createSyncedNoteRepository } from "../domain/notes/syncedNoteRepository";
import { createNoteCrypto } from "../domain/crypto/noteCrypto";
import { createNoteSyncEngine } from "../domain/sync/noteSyncEngine";
import { createRemoteNotesGateway } from "../storage/remoteNotesGateway";
import { syncEncryptedImages } from "../storage/unifiedImageSyncService";
import { createUnifiedSyncedImageRepository } from "../storage/unifiedSyncedImageRepository";
import { runtimeClock, runtimeConnectivity } from "../storage/runtimeAdapters";
import { syncStateStore } from "../storage/syncStateStore";
import { useServiceContext } from "../contexts/serviceContext";
import { noteContentStore } from "../stores/noteContentStore";
import { syncStore } from "../stores/syncStore";
import { triggerAiAnalysis } from "../domain/ai/triggerAiAnalysis";
import { loadAiMetaForDate } from "../storage/aiMetaStore";
import { localAiStore } from "../stores/localAiStore";
import type { E2eeService } from "../domain/crypto/e2eeService";

interface UseNoteRepositoryProps {
  mode: AppMode;
  authUser: User | null;
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  activeKeyId: string | null;
  date: string | null;
  year: number;
}

export interface UseNoteRepositoryReturn {
  repository: NoteRepository | null;
  imageRepository: ImageRepository | null;
  syncedRepo: NoteRepository | null;
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
  /** Error from loading/decrypting the note (e.g. DecryptFailed) */
  noteError: Error | null;
  repositoryVersion: number;
  invalidateRepository: () => void;
}

export function useNoteRepository({
  mode,
  authUser,
  vaultKey,
  keyring,
  activeKeyId,
  date,
  year,
}: UseNoteRepositoryProps): UseNoteRepositoryReturn {
  const { supabase, e2eeFactory } = useServiceContext();
  const userId = authUser?.id ?? null;
  const [repositoryVersion, setRepositoryVersion] = useState(0);
  const invalidateRepository = useCallback(() => {
    setRepositoryVersion((current) => current + 1);
  }, []);

  const syncedFactories = useMemo<SyncedRepositoryFactories>(
    () => ({
      createSyncedNoteRepository: ({ userId, keyProvider }) => {
        const gateway = createRemoteNotesGateway(supabase, userId);
        const e2ee = e2eeFactory.create(keyProvider);
        const crypto = createNoteCrypto(e2ee);
        const engine = createNoteSyncEngine(
          gateway,
          keyProvider.activeKeyId,
          () => syncEncryptedImages(supabase, userId),
          runtimeConnectivity,
          runtimeClock,
          syncStateStore,
        );
        return createSyncedNoteRepository(crypto, engine);
      },
      createSyncedImageRepository: ({ userId, keyProvider }) =>
        createUnifiedSyncedImageRepository(supabase, userId, keyProvider),
      e2eeFactory,
    }),
    [e2eeFactory, supabase],
  );

  const repository = useMemo<NoteRepository | null>(() => {
    if (!vaultKey || !activeKeyId) return null;
    void repositoryVersion;
    const keyProvider = {
      activeKeyId,
      getKey: (keyId: string) => keyring.get(keyId) ?? null,
    };

    return createNoteRepository({
      mode,
      userId,
      keyProvider,
      syncedFactories,
    });
  }, [
    mode,
    userId,
    vaultKey,
    activeKeyId,
    keyring,
    syncedFactories,
    repositoryVersion,
  ]);

  const imageRepository = useMemo<ImageRepository | null>(() => {
    if (!vaultKey || !activeKeyId) return null;
    void repositoryVersion;
    const keyProvider = {
      activeKeyId,
      getKey: (keyId: string) => keyring.get(keyId) ?? null,
    };
    return createImageRepository({
      mode,
      userId,
      keyProvider,
      syncedFactories,
    });
  }, [
    vaultKey,
    activeKeyId,
    mode,
    userId,
    keyring,
    syncedFactories,
    repositoryVersion,
  ]);

  const syncedRepo =
    mode === AppMode.Cloud && userId && repository?.syncCapable
      ? repository
      : null;
  const syncEnabled =
    mode === AppMode.Cloud && !!userId && !!vaultKey && !!activeKeyId;
  const {
    syncStatus,
    syncError,
    triggerSync,
    queueIdleSync,
    pendingOps,
  } = useSync(syncedRepo, { enabled: syncEnabled, userId, supabase });
  const { hasNote, noteDates, refreshNoteDates, applyNoteChange } =
    useNoteDates(repository, year);
  const capabilities = useMemo(
    () => ({
      canSync: !!syncedRepo,
      canUploadImages: !!imageRepository,
    }),
    [syncedRepo, imageRepository],
  );

  // E2EE service for AI metadata encryption
  const e2eeRef = useRef<E2eeService | null>(null);
  const e2eeService = useMemo(() => {
    if (!vaultKey || !activeKeyId) return null;
    const keyProvider = {
      activeKeyId,
      getKey: (keyId: string) => keyring.get(keyId) ?? null,
    };
    return e2eeFactory.create(keyProvider);
  }, [vaultKey, activeKeyId, keyring, e2eeFactory]);
  useEffect(() => {
    e2eeRef.current = e2eeService;
  }, [e2eeService]);

  // After-save callback: apply note change to calendar + queue idle sync + AI
  const handleAfterSave = useCallback(
    (snapshot: { date: string; content: string; isEmpty: boolean }) => {
      console.debug(
        "[AI] afterSave fired, date:",
        snapshot.date,
        "empty:",
        snapshot.isEmpty,
        "e2ee:",
        !!e2eeRef.current,
      );
      applyNoteChange(snapshot.date, snapshot.isEmpty);
      queueIdleSync();

      // Trigger local AI analysis (fire-and-forget; errors logged internally)
      if (!snapshot.isEmpty && e2eeRef.current) {
        triggerAiAnalysis(snapshot.date, snapshot.content, e2eeRef.current);
      }
    },
    [applyNoteChange, queueIdleSync],
  );

  const {
    content,
    setContent,
    isDecrypting,
    hasEdits,
    isSaving,
    isContentReady,
    isOfflineStub,
    error: noteError,
  } = useNoteContent(date, repository, hasNote, handleAfterSave);

  // Hydrate AI metadata cache from IndexedDB when viewing a note
  useEffect(() => {
    if (!date || !e2eeRef.current) return;
    const e2ee = e2eeRef.current;

    // Skip if already cached
    if (localAiStore.getState().getAiMeta(date)) return;

    void loadAiMetaForDate(date, e2ee).then((meta) => {
      if (meta) {
        localAiStore.getState().cacheAiMeta(date, meta);
      }
    });
  }, [date]);

  // Cross-concern coordination via Zustand subscribe()
  // When sync completes or realtime changes arrive, refresh current note
  useEffect(() => {
    // Sync completion → refresh current note
    const unsubSync = syncStore.subscribe(
      (s) => s.syncCompletionCount,
      () => {
        const ns = noteContentStore.getState();
        if (ns.date && !ns.hasEdits && (ns.status === "ready" || ns.status === "error")) {
          ns.forceRefresh();
        }
      },
    );

    // Realtime change → refresh if it's our current note
    const unsubRealtime = syncStore.subscribe(
      (s) => s.lastRealtimeChangedDate,
      (changedDate) => {
        if (!changedDate) return;
        const ns = noteContentStore.getState();
        if (
          changedDate === ns.date &&
          !ns.hasEdits &&
          (ns.status === "ready" || ns.status === "error")
        ) {
          ns.forceRefresh();
          syncStore.getState().clearRealtimeChanged();
        }
      },
    );

    return () => {
      unsubSync();
      unsubRealtime();
    };
  }, []);

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
    noteError,
    repositoryVersion,
    invalidateRepository,
  };
}
