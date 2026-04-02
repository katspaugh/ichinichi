import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "../lib/supabase";
import type { RemoteNotes } from "../storage/remoteNotes";
import type { RemoteNoteRow } from "../storage/parsers";
import {
  setCachedNote,
  deleteCachedNote,
  getSyncCursor,
  setSyncCursor,
} from "../storage/cache";
import { SyncStatus } from "../types";
import { useConnectivity } from "./useConnectivity";
import { reportError } from "../utils/errorReporter";

export async function syncAll(remote: RemoteNotes): Promise<void> {
  const cursor = await getSyncCursor();
  const rows: RemoteNoteRow[] = await remote.fetchNotesSince(cursor);

  let latestCursor: string | null = cursor;

  for (const row of rows) {
    if (row.deleted) {
      await deleteCachedNote(row.date);
    } else {
      await setCachedNote({
        date: row.date,
        ciphertext: row.ciphertext,
        nonce: row.nonce,
        keyId: row.key_id ?? "legacy",
        updatedAt: row.updated_at,
        revision: row.revision,
        remoteId: row.id,
      });
    }

    if (
      latestCursor === null ||
      row.server_updated_at > latestCursor
    ) {
      latestCursor = row.server_updated_at;
    }
  }

  if (latestCursor !== null && latestCursor !== cursor) {
    await setSyncCursor(latestCursor);
  }
}

interface UseSyncOptions {
  remote: RemoteNotes | null;
  supabase: SupabaseClient | null;
  userId: string | null;
  enabled: boolean;
  onSyncComplete?: () => void;
}

export interface UseSyncReturn {
  syncStatus: SyncStatus;
  triggerSync: () => void;
}

export function useSync(options: UseSyncOptions): UseSyncReturn {
  const { remote, supabase, userId, enabled, onSyncComplete } = options;
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(SyncStatus.Idle);
  const online = useConnectivity();
  const syncingRef = useRef(false);
  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;

  const doSync = useCallback(async () => {
    if (!remote || !enabled || syncingRef.current) return;
    syncingRef.current = true;
    setSyncStatus(SyncStatus.Syncing);
    try {
      await syncAll(remote);
      setSyncStatus(SyncStatus.Synced);
      onSyncCompleteRef.current?.();
    } catch (err) {
      setSyncStatus(SyncStatus.Error);
      reportError("useSync.doSync", err);
    } finally {
      syncingRef.current = false;
    }
  }, [remote, enabled]);

  // Initial sync
  useEffect(() => {
    if (enabled && remote && online) {
      doSync();
    }
  }, [enabled, remote, online, doSync]);

  // Periodic sync
  useEffect(() => {
    if (!enabled || !remote || !online) return;
    const id = setInterval(doSync, 30_000);
    return () => clearInterval(id);
  }, [enabled, remote, online, doSync]);

  // Focus sync
  useEffect(() => {
    if (!enabled || !remote) return;
    window.addEventListener("focus", doSync);
    return () => window.removeEventListener("focus", doSync);
  }, [enabled, remote, doSync]);

  // Realtime sync
  useEffect(() => {
    if (!supabase || !userId || !enabled) return;
    const channel = supabase
      .channel(`notes:${userId}`)
      .on(
        "postgres_changes" as Parameters<ReturnType<SupabaseClient["channel"]>["on"]>[0],
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `user_id=eq.${userId}`,
        },
        () => { doSync(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, userId, enabled, doSync]);

  // Reset sync state when disabled (e.g. sign-out)
  useEffect(() => {
    if (!enabled) {
      syncingRef.current = false;
      setSyncStatus(SyncStatus.Idle);
    }
  }, [enabled]);

  // Offline detection
  useEffect(() => {
    if (!online && enabled) {
      setSyncStatus(SyncStatus.Offline);
    }
  }, [online, enabled]);

  const triggerSync = useCallback(() => { doSync(); }, [doSync]);

  return { syncStatus, triggerSync };
}
