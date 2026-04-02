import { useCallback, useEffect, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import type { RepositoryError } from "../domain/errors";
import { useNoteContent } from "./useNoteContent";
import { useNoteDates } from "./useNoteDates";
import { useSync } from "./useSync";
import { useSyncedFactories } from "./useSyncedFactories";
import { useRepositoryFactory } from "./useRepositoryFactory";
import type { SyncCapableNoteRepository } from "../storage/noteRepository";
import { isSyncCapableNoteRepository } from "../storage/noteRepository";
import type { ImageRepository } from "../storage/imageRepository";
import { AppMode } from "./useAppMode";
import { useServiceContext } from "../contexts/serviceContext";
import { createStoreCoordinator } from "../stores/storeCoordinator";

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
  repository: ReturnType<typeof useRepositoryFactory>["repository"];
  imageRepository: ImageRepository | null;
  syncedRepo: SyncCapableNoteRepository | null;
  syncStatus: ReturnType<typeof useSync>["syncStatus"];
  syncError: ReturnType<typeof useSync>["syncError"];
  triggerSync: ReturnType<typeof useSync>["triggerSync"];
  queueIdleSync: ReturnType<typeof useSync>["queueIdleSync"];
  pendingOps: ReturnType<typeof useSync>["pendingOps"];
  capabilities: { canSync: boolean; canUploadImages: boolean };
  content: string;
  setContent: (content: string) => void;
  hasEdits: boolean;
  isSaving: boolean;
  hasNote: (date: string) => boolean;
  noteDates: Set<string>;
  refreshNoteDates: (options?: { immediate?: boolean }) => void;
  isDecrypting: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
  isSoftDeleted: boolean;
  restoreNote: () => void;
  noteError: RepositoryError | null;
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
  const {
    supabase,
    e2eeFactory,
    noteContentStore,
    syncStore,
  } = useServiceContext();
  const userId = authUser?.id ?? null;

  const syncedFactories = useSyncedFactories(supabase, e2eeFactory);

  const { repository, imageRepository, repositoryVersion, invalidateRepository } =
    useRepositoryFactory({
      mode,
      userId,
      vaultKey,
      keyring,
      activeKeyId,
      syncedFactories,
    });

  const syncedRepo =
    mode === AppMode.Cloud &&
    userId &&
    isSyncCapableNoteRepository(repository)
      ? repository
      : null;
  const syncEnabled =
    syncedRepo !== null && !!vaultKey && !!activeKeyId;

  const { syncStatus, syncError, triggerSync, queueIdleSync, pendingOps } =
    useSync(syncedRepo, { enabled: syncEnabled, userId, supabase });

  const { hasNote, noteDates, refreshNoteDates, applyNoteChange } =
    useNoteDates(repository, year);

  const capabilities = useMemo(
    () => ({
      canSync: !!syncedRepo,
      canUploadImages: !!imageRepository,
    }),
    [syncedRepo, imageRepository],
  );

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
    isSoftDeleted,
    restoreNote,
    error: noteError,
  } = useNoteContent(date, repository, hasNote, handleAfterSave);

  // Cross-store coordination: sync completion/realtime -> refresh note
  useEffect(() => {
    return createStoreCoordinator(syncStore, noteContentStore);
  }, [syncStore, noteContentStore]);

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
    isSoftDeleted,
    restoreNote,
    noteError,
    repositoryVersion,
    invalidateRepository,
  };
}
