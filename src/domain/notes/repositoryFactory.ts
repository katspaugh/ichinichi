import { supabase } from '../../lib/supabase';
import { createUnifiedNoteRepository } from '../../storage/unifiedNoteRepository';
import { createUnifiedSyncedNoteRepository } from '../../storage/unifiedSyncedNoteRepository';
import { createUnifiedImageRepository } from '../../storage/unifiedImageRepository';
import { createUnifiedSyncedImageRepository } from '../../storage/unifiedSyncedImageRepository';
import type { UnifiedSyncedNoteRepository } from '../../storage/unifiedSyncedNoteRepository';
import type { NoteRepository } from '../../storage/noteRepository';
import type { ImageRepository } from '../../storage/imageRepository';
import type { KeyringProvider } from '../../storage/unifiedNoteRepository';
import { AppMode } from '../../hooks/useAppMode';

interface NoteRepositoryOptions {
  mode: AppMode;
  userId: string | null;
  keyProvider: KeyringProvider;
}

interface ImageRepositoryOptions {
  mode: AppMode;
  userId: string | null;
  keyProvider: KeyringProvider;
}

export function createNoteRepository({
  mode,
  userId,
  keyProvider
}: NoteRepositoryOptions): NoteRepository | UnifiedSyncedNoteRepository {
  if (mode === AppMode.Cloud && userId) {
    return createUnifiedSyncedNoteRepository(supabase, userId, keyProvider);
  }
  return createUnifiedNoteRepository(keyProvider);
}

export function createImageRepository({
  mode,
  userId,
  keyProvider
}: ImageRepositoryOptions): ImageRepository {
  if (mode === AppMode.Cloud && userId) {
    return createUnifiedSyncedImageRepository(supabase, userId, keyProvider);
  }
  return createUnifiedImageRepository(keyProvider);
}
