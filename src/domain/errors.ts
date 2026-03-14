export interface ErrorContext {
  date?: string;
  operation?: string;
}

export type StorageError =
  | { type: "NotFound"; message: string; context?: ErrorContext }
  | { type: "Corrupt"; message: string; context?: ErrorContext }
  | { type: "IO"; message: string; context?: ErrorContext }
  | { type: "Unknown"; message: string; context?: ErrorContext };

export type CryptoError =
  | { type: "KeyMissing"; message: string; context?: ErrorContext }
  | { type: "EncryptFailed"; message: string; context?: ErrorContext }
  | { type: "DecryptFailed"; message: string; context?: ErrorContext }
  | { type: "Unknown"; message: string; context?: ErrorContext };

export type SyncError =
  | { type: "Offline"; message: string; context?: ErrorContext }
  | { type: "Conflict"; message: string; context?: ErrorContext }
  | { type: "RemoteRejected"; message: string; context?: ErrorContext }
  | { type: "Unknown"; message: string; context?: ErrorContext };

export type VaultError =
  | { type: "VaultLocked"; message: string; context?: ErrorContext }
  | { type: "KeyMissing"; message: string; context?: ErrorContext }
  | { type: "UnlockFailed"; message: string; context?: ErrorContext }
  | { type: "Unknown"; message: string; context?: ErrorContext };

export type RepositoryError = StorageError | CryptoError;
