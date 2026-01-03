import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNoteContent } from './useNoteContent';
import { useNoteDates } from './useNoteDates';
import { useSync } from './useSync';
import { createNoteRepository, createImageRepository } from '../domain/notes/repositoryFactory';
import type { UnifiedSyncedNoteRepository } from '../storage/unifiedSyncedNoteRepository';
import type { NoteRepository } from '../storage/noteRepository';
import type { ImageRepository } from '../storage/imageRepository';
import { AppMode } from './useAppMode';

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
  if (!keyring.size) return '';
  return Array.from(keyring.entries())
    .map(([keyId, key]) => `${keyId}:${getKeyringToken(key)}`)
    .sort()
    .join('|');
}

const noteRepositoryCache = new Map<string, NoteRepository | UnifiedSyncedNoteRepository>();
const imageRepositoryCache = new Map<string, ImageRepository>();

function getRepositoryCacheKey({
  kind,
  mode,
  userId,
  activeKeyId,
  vaultKey,
  keyringSignature
}: {
  kind: 'note' | 'image';
  mode: AppMode;
  userId: string | null;
  activeKeyId: string;
  vaultKey: CryptoKey;
  keyringSignature: string;
}) {
  const vaultToken = getKeyringToken(vaultKey);
  const userToken = userId ?? 'local';
  return `${kind}:${mode}:${userToken}:${activeKeyId}:${vaultToken}:${keyringSignature}`;
}

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
  const keyringSignature = useMemo(() => getKeyringSignature(keyring), [keyring]);
  const repository = useMemo<NoteRepository | UnifiedSyncedNoteRepository | null>(() => {
    if (!vaultKey || !activeKeyId) return null;
    const cacheKey = getRepositoryCacheKey({
      kind: 'note',
      mode,
      userId,
      activeKeyId,
      vaultKey,
      keyringSignature
    });
    const cached = noteRepositoryCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const keyProvider = {
      activeKeyId,
      getKey: (keyId: string) => keyring.get(keyId) ?? null
    };

    const created = createNoteRepository({
      mode,
      userId,
      keyProvider
    });
    noteRepositoryCache.set(cacheKey, created);
    return created;
  }, [mode, userId, vaultKey, keyring, activeKeyId, keyringSignature]);

  const imageRepository = useMemo<ImageRepository | null>(() => {
    if (!vaultKey || !activeKeyId) return null;
    const cacheKey = getRepositoryCacheKey({
      kind: 'image',
      mode,
      userId,
      activeKeyId,
      vaultKey,
      keyringSignature
    });
    const cached = imageRepositoryCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const keyProvider = {
      activeKeyId,
      getKey: (keyId: string) => keyring.get(keyId) ?? null
    };
    const created = createImageRepository({
      mode,
      userId,
      keyProvider
    });
    imageRepositoryCache.set(cacheKey, created);
    return created;
  }, [vaultKey, keyring, activeKeyId, mode, userId, keyringSignature]);

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
