import { createLocalNoteRepository } from "./localNoteRepository";
import { createHydratingImageRepository } from "../images/hydratingImageRepository";
import { createNoteCrypto } from "../crypto/noteCrypto";
import type { E2eeServiceFactory } from "../crypto/e2eeService";
import type { KeyringProvider } from "../crypto/keyring";
import type {
  NoteRepository,
  SyncCapableNoteRepository,
} from "../../storage/noteRepository";
import type { ImageRepository } from "../../storage/imageRepository";
import { AppMode } from "../../types/appMode";
import type { NoteEnvelopePort } from "./noteEnvelopePort";
import type { RemoteDateIndexPort } from "./remoteDateIndexPort";

export interface SyncedRepositoryFactories {
  createSyncedNoteRepository: (options: {
    userId: string;
    keyProvider: KeyringProvider;
    envelopePort: NoteEnvelopePort;
    remoteDateIndex: RemoteDateIndexPort;
  }) => SyncCapableNoteRepository;
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
  envelopePort: NoteEnvelopePort;
  remoteDateIndex: RemoteDateIndexPort;
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
  envelopePort,
  remoteDateIndex,
  syncedFactories,
}: NoteRepositoryOptions): NoteRepository {
  if (mode === AppMode.Cloud && userId && syncedFactories) {
    return syncedFactories.createSyncedNoteRepository({
      userId,
      keyProvider,
      envelopePort,
      remoteDateIndex,
    });
  }
  if (!syncedFactories) {
    throw new Error("Missing synced repository factories.");
  }
  const crypto = createNoteCrypto(syncedFactories.e2eeFactory.create(keyProvider));
  return createLocalNoteRepository(crypto, envelopePort);
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
