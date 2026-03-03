import { createLocalNoteRepository } from "./localNoteRepository";
import { createHydratingImageRepository } from "../images/hydratingImageRepository";
import { createNoteCrypto } from "../crypto/noteCrypto";
import type { E2eeServiceFactory } from "../crypto/e2eeService";
import type { KeyringProvider } from "../crypto/keyring";
import type { NoteRepository } from "../../storage/noteRepository";
import type { ImageRepository } from "../../storage/imageRepository";
import { AppMode } from "../../types/appMode";

export interface SyncedRepositoryFactories {
  createSyncedNoteRepository: (options: {
    userId: string;
    keyProvider: KeyringProvider;
  }) => NoteRepository;
  createSyncedImageRepository: (options: {
    userId: string;
    keyProvider: KeyringProvider;
  }) => ImageRepository;
  e2eeFactory: E2eeServiceFactory;
}

interface NoteRepositoryOptions {
  mode: AppMode;
  userId: string | null;
  keyProvider: KeyringProvider;
  syncedFactories?: SyncedRepositoryFactories;
}

interface ImageRepositoryOptions {
  mode: AppMode;
  userId: string | null;
  keyProvider: KeyringProvider;
  syncedFactories?: SyncedRepositoryFactories;
}

export function createNoteRepository({
  mode,
  userId,
  keyProvider,
  syncedFactories,
}: NoteRepositoryOptions): NoteRepository {
  if (mode === AppMode.Cloud && userId && syncedFactories) {
    return syncedFactories.createSyncedNoteRepository({
      userId,
      keyProvider,
    });
  }
  if (!syncedFactories) {
    throw new Error("Missing synced repository factories.");
  }
  const crypto = createNoteCrypto(syncedFactories.e2eeFactory.create(keyProvider));
  return createLocalNoteRepository(crypto);
}

export function createImageRepository({
  mode,
  userId,
  keyProvider,
  syncedFactories,
}: ImageRepositoryOptions): ImageRepository {
  if (mode === AppMode.Cloud && userId && syncedFactories) {
    return syncedFactories.createSyncedImageRepository({
      userId,
      keyProvider,
    });
  }
  if (!syncedFactories) {
    throw new Error("Missing synced repository factories.");
  }
  return createHydratingImageRepository(keyProvider, syncedFactories.e2eeFactory);
}
