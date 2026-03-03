import type { StorageError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import type { SyncStateRecord, SyncStateStore } from "../domain/sync/syncStateStore";
import { getSyncState, setSyncState } from "./unifiedSyncStateStore";

function toStorageError(error: unknown): StorageError {
  if (error instanceof Error) {
    return { type: "IO", message: error.message };
  }
  return { type: "Unknown", message: "Sync state failed." };
}

export const syncStateStore: SyncStateStore = {
  async getState(): Promise<Result<SyncStateRecord, StorageError>> {
    try {
      const state = await getSyncState();
      return ok({ id: state.id, cursor: state.cursor ?? null });
    } catch (error) {
      return err(toStorageError(error));
    }
  },
  async setState(state: SyncStateRecord): Promise<Result<void, StorageError>> {
    try {
      await setSyncState({ id: state.id, cursor: state.cursor ?? null });
      return ok(undefined);
    } catch (error) {
      return err(toStorageError(error));
    }
  },
};
