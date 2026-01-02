import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNoteContent } from './useNoteContent';
import { useNoteDates } from './useNoteDates';
import { useSync } from './useSync';
import { supabase } from '../lib/supabase';
import { createUnifiedNoteRepository } from '../storage/unifiedNoteRepository';
import { createUnifiedSyncedNoteRepository } from '../storage/unifiedSyncedNoteRepository';
import { createUnifiedImageRepository } from '../storage/unifiedImageRepository';
import { createUnifiedSyncedImageRepository } from '../storage/unifiedSyncedImageRepository';
import type { UnifiedSyncedNoteRepository } from '../storage/unifiedSyncedNoteRepository';
import type { NoteRepository } from '../storage/noteRepository';
import type { ImageRepository } from '../storage/imageRepository';
import { AppMode } from './useAppMode';

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
  repository: NoteRepository | UnifiedSyncedNoteRepository | null;
  imageRepository: ImageRepository | null;
  syncedRepo: UnifiedSyncedNoteRepository | null;
  syncStatus: ReturnType<typeof useSync>['syncStatus'];
  triggerSync: ReturnType<typeof useSync>['triggerSync'];
  queueIdleSync: ReturnType<typeof useSync>['queueIdleSync'];
  pendingOps: ReturnType<typeof useSync>['pendingOps'];
  capabilities: {
    canSync: boolean;
    canUploadImages: boolean;
  };
  content: string;
  setContent: (content: string) => void;
  hasEdits: boolean;
  hasNote: (date: string) => boolean;
  noteDates: Set<string>;
  refreshNoteDates: (options?: { immediate?: boolean }) => void;
  isDecrypting: boolean;
  isContentReady: boolean;
}

export function useNoteRepository({
  mode,
  authUser,
  vaultKey,
  keyring,
  activeKeyId,
  date,
  year
}: UseNoteRepositoryProps): UseNoteRepositoryReturn {
  const userId = authUser?.id ?? null;
  const repository = useMemo<NoteRepository | UnifiedSyncedNoteRepository | null>(() => {
    if (!vaultKey || !activeKeyId) return null;
    const keyProvider = {
      activeKeyId,
      getKey: (keyId: string) => keyring.get(keyId) ?? null
    };

    if (mode === AppMode.Cloud && userId) {
      return createUnifiedSyncedNoteRepository(supabase, userId, keyProvider);
    }

    return createUnifiedNoteRepository(keyProvider);
  }, [mode, userId, vaultKey, keyring, activeKeyId]);

  const imageRepository = useMemo<ImageRepository | null>(() => {
    if (!vaultKey || !activeKeyId) return null;
    const keyProvider = {
      activeKeyId,
      getKey: (keyId: string) => keyring.get(keyId) ?? null
    };
    if (mode === AppMode.Cloud && userId) {
      return createUnifiedSyncedImageRepository(supabase, userId, keyProvider);
    }
    return createUnifiedImageRepository(keyProvider);
  }, [vaultKey, keyring, activeKeyId, mode, userId]);

  const syncedRepo =
    mode === AppMode.Cloud && userId ? (repository as UnifiedSyncedNoteRepository) : null;
  const { syncStatus, triggerSync, queueIdleSync, pendingOps } = useSync(syncedRepo);
  const { hasNote, noteDates, refreshNoteDates } = useNoteDates(repository, year);
  const capabilities = useMemo(() => ({
    canSync: !!syncedRepo,
    canUploadImages: !!imageRepository
  }), [syncedRepo, imageRepository]);
  const refreshTimerRef = useRef<number | null>(null);
  const handleAfterSave = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      refreshNoteDates();
    }, 500);
    queueIdleSync();
  }, [queueIdleSync, refreshNoteDates]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const {
    content,
    setContent,
    isDecrypting,
    hasEdits,
    isContentReady
  } = useNoteContent(date, repository, handleAfterSave);

  return {
    repository,
    imageRepository,
    syncedRepo,
    syncStatus,
    triggerSync,
    queueIdleSync,
    pendingOps,
    capabilities,
    content,
    setContent,
    hasEdits,
    hasNote,
    noteDates,
    refreshNoteDates,
    isDecrypting,
    isContentReady
  };
}
