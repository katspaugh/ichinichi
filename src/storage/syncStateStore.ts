import type { SyncError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import type { SyncStateRecord, SyncStateStore } from "../domain/sync/syncStateStore";
import { getSyncState, setSyncState } from "./unifiedSyncStateStore";

function toSyncError(error: unknown): SyncError {
  if (error instanceof Error) {
    return { type: "Unknown", message: error.message };
  }
  return { type: "Unknown", message: "Sync state failed." };
}

export const syncStateStore: SyncStateStore = {
  async getState(): Promise<Result<SyncStateRecord, SyncError>> {
    try {
      const state = await getSyncState();
      return ok({ id: state.id, cursor: state.cursor ?? null });
    } catch (error) {
      return err(toSyncError(error));
    }
  },
  async setState(state: SyncStateRecord): Promise<Result<void, SyncError>> {
    try {
      await setSyncState({ id: state.id, cursor: state.cursor ?? null });
      return ok(undefined);
    } catch (error) {
      return err(toSyncError(error));
    }
  },
};
