export type StorageError =
  | { type: "NotFound"; message: string }
  | { type: "Corrupt"; message: string }
  | { type: "IO"; message: string }
  | { type: "Unknown"; message: string };

export type CryptoError =
  | { type: "KeyMissing"; message: string }
  | { type: "EncryptFailed"; message: string }
  | { type: "DecryptFailed"; message: string }
  | { type: "Unknown"; message: string };

export type SyncError =
  | { type: "Offline"; message: string }
  | { type: "Conflict"; message: string }
  | { type: "RemoteRejected"; message: string }
  | { type: "Unknown"; message: string };

export type VaultError =
  | { type: "VaultLocked"; message: string }
  | { type: "KeyMissing"; message: string }
  | { type: "UnlockFailed"; message: string }
  | { type: "Unknown"; message: string };
