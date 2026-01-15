import type { SyncError } from "../domain/errors";

export function formatSyncError(error: SyncError): string {
  switch (error.type) {
    case "Offline":
      return "Offline";
    case "Conflict":
      return "Conflict detected";
    case "RemoteRejected":
      return "Remote rejected changes";
    case "Unknown":
      return "Sync failed";
    default:
      return "Sync failed";
  }
}
