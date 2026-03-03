import type { Result } from "../result";
import type { StorageError } from "../errors";

export interface SyncStateRecord {
  id: "state";
  cursor: string | null;
  weatherCursor?: string | null;
}

export interface SyncStateStore {
  getState(): Promise<Result<SyncStateRecord, StorageError>>;
  setState(state: SyncStateRecord): Promise<Result<void, StorageError>>;
}
