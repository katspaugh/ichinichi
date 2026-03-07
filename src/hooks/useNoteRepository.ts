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
import type {
  NoteRepository,
  SyncCapableNoteRepository,
} from "../storage/noteRepository";
import { isSyncCapableNoteRepository } from "../storage/noteRepository";
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
import { createNoteEnvelopeAdapter } from "../storage/noteEnvelopeAdapter";
import { createRemoteDateIndexAdapter } from "../storage/remoteDateIndexAdapter";

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
  syncedRepo: SyncCapableNoteRepository | null;
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

  const envelopePort = useMemo(() => createNoteEnvelopeAdapter(), []);
  const remoteDateIndex = useMemo(() => createRemoteDateIndexAdapter(), []);

  // Ref keeps keyProvider.getKey() reading the latest keyring without
  // recreating the repository (and restarting sync) on every keyring
  // reference change.  The keyring Map changes multiple times after
  // sign-in as the vault machine loads local keys and caches cloud
  // keys — none of those changes should interrupt an in-flight sync.
  const keyringRef = useRef(keyring);
  useEffect(() => {
    keyringRef.current = keyring;
  }, [keyring]);

  const syncedFactories = useMemo<SyncedRepositoryFactories>(
    () => ({
      createSyncedNoteRepository: ({ userId, keyProvider, envelopePort, remoteDateIndex }) => {
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
          envelopePort,
          remoteDateIndex,
        );
        return createSyncedNoteRepository(crypto, engine, envelopePort, remoteDateIndex);
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
      getKey: (keyId: string) => keyringRef.current.get(keyId) ?? null,
    };

    // getKey reads the ref at I/O time (decrypt), never during render
    // eslint-disable-next-line react-hooks/refs
    return createNoteRepository({
      mode,
      userId,
      keyProvider,
      envelopePort,
      remoteDateIndex,
      syncedFactories,
    });
  }, [
    mode,
    userId,
    vaultKey,
    activeKeyId,
    syncedFactories,
    envelopePort,
    remoteDateIndex,
    repositoryVersion,
  ]);

  const imageRepository = useMemo<ImageRepository | null>(() => {
    if (!vaultKey || !activeKeyId) return null;
    void repositoryVersion;
    const keyProvider = {
      activeKeyId,
      getKey: (keyId: string) => keyringRef.current.get(keyId) ?? null,
    };
    // eslint-disable-next-line react-hooks/refs
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
    syncedFactories,
    repositoryVersion,
  ]);

  const syncedRepo =
    mode === AppMode.Cloud && userId && isSyncCapableNoteRepository(repository)
      ? repository
      : null;
  const syncEnabled = syncedRepo !== null && !!vaultKey && !!activeKeyId;
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

  // After-save callback: apply note change to calendar + queue idle sync
  const handleAfterSave = useCallback(
    (snapshot: { date: string; isEmpty: boolean }) => {
      applyNoteChange(snapshot.date, snapshot.isEmpty);
      queueIdleSync();
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

  // Cross-concern coordination via Zustand subscribe()
  // When sync completes or realtime changes arrive, refresh current note
  useEffect(() => {
    // Sync completion → re-read note from local (sync already updated IndexedDB)
    const unsubSync = syncStore.subscribe(
      (s) => s.syncCompletionCount,
      () => {
        const ns = noteContentStore.getState();
        if (ns.date && !ns.hasEdits && (ns.status === "ready" || ns.status === "error")) {
          void ns.reloadFromLocal();
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
