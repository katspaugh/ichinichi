import type { Result } from "../result";
import type { SyncError } from "../errors";

export interface SyncStateRecord {
  id: "state";
  cursor: string | null;
}

export interface SyncStateStore {
  getState(): Promise<Result<SyncStateRecord, SyncError>>;
  setState(state: SyncStateRecord): Promise<Result<void, SyncError>>;
}
