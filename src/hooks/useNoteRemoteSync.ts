import { useCallback, useEffect, useRef, useState } from "react";
import type { Note } from "../types";
import type { NoteRepository } from "../storage/noteRepository";
import { useConnectivity } from "./useConnectivity";

interface RefreshableNoteRepository {
  refreshNote: (date: string) => Promise<Note | null>;
}

interface RemoteIndexRepository {
  hasRemoteDateCached: (date: string) => Promise<boolean>;
}

interface PendingOpRepository {
  hasPendingOp: (date: string) => Promise<boolean>;
}

function canRefresh(
  repository: NoteRepository,
): repository is NoteRepository & RefreshableNoteRepository {
  return (
    "refreshNote" in repository && typeof repository.refreshNote === "function"
  );
}

function hasRemoteIndex(
  repository: NoteRepository,
): repository is NoteRepository & RemoteIndexRepository {
  return (
    "hasRemoteDateCached" in repository &&
    typeof repository.hasRemoteDateCached === "function"
  );
}

function hasPendingOps(
  repository: NoteRepository,
): repository is NoteRepository & PendingOpRepository {
  return (
    "hasPendingOp" in repository &&
    typeof repository.hasPendingOp === "function"
  );
}

export interface UseNoteRemoteSyncReturn {
  /** Whether there's a known remote note that we can't access offline */
  isKnownRemoteOnly: boolean;
  /** Trigger a background refresh from remote */
  triggerRefresh: () => void;
}

interface UseNoteRemoteSyncOptions {
  /** Called when remote has updated content */
  onRemoteUpdate?: (content: string) => void;
  /** Current local content (used to avoid redundant updates) */
  localContent: string;
  /** Whether local has unsaved edits (skip sync if true) */
  hasLocalEdits: boolean;
  /** Whether local content is ready (only sync after local load completes) */
  isLocalReady: boolean;
}

/**
 * Hook for syncing note content with remote server.
 * This hook handles all network-related operations.
 *
 * Responsibilities:
 * - Check if note exists remotely but not locally (for offline stub detection)
 * - Trigger background refresh when online
 * - Notify when remote has updated content
 *
 * NOT responsible for:
 * - Reading/writing local storage
 * - Managing edit state
 * - Determining overall loading state
 */
export function useNoteRemoteSync(
  date: string | null,
  repository: NoteRepository | null,
  options: UseNoteRemoteSyncOptions,
): UseNoteRemoteSyncReturn {
  const { onRemoteUpdate, localContent, hasLocalEdits, isLocalReady } = options;
  const online = useConnectivity();

  // Track async result of remote cache check
  const [remoteCacheResult, setRemoteCacheResult] = useState<{
    date: string;
    hasRemote: boolean;
  } | null>(null);

  const localContentRef = useRef(localContent);
  const hasLocalEditsRef = useRef(hasLocalEdits);

  // Keep refs in sync
  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);

  useEffect(() => {
    hasLocalEditsRef.current = hasLocalEdits;
  }, [hasLocalEdits]);

  // Check for remote-only note status when offline
  useEffect(() => {
    // Early exit conditions that don't need async check
    if (
      !date ||
      !repository ||
      !isLocalReady ||
      online ||
      localContent !== ""
    ) {
      return;
    }

    // Check if repository supports remote index
    if (!hasRemoteIndex(repository)) {
      return;
    }

    let cancelled = false;

    void repository
      .hasRemoteDateCached(date)
      .then((hasRemote) => {
        if (!cancelled) {
          setRemoteCacheResult({ date, hasRemote });
        }
      })
      .catch((error) => {
        console.error("Failed to check remote date cache:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [date, repository, localContent, online, isLocalReady]);

  // Derive isKnownRemoteOnly from state
  // A note is "known remote only" when:
  // - We're offline
  // - Local content is empty
  // - We've checked the remote cache and it says the note exists
  // - The cache result is for the current date
  const isKnownRemoteOnly =
    !online &&
    localContent === "" &&
    isLocalReady &&
    remoteCacheResult !== null &&
    remoteCacheResult.date === date &&
    remoteCacheResult.hasRemote;

  // Background refresh when online and local is ready
  const triggerRefresh = useCallback(() => {
    if (!date || !repository || !online || !isLocalReady) {
      return;
    }

    if (!canRefresh(repository)) {
      return;
    }

    void repository
      .refreshNote(date)
      .then(async (remoteNote) => {
        // If we couldn't reach the server, ignore
        if (!remoteNote) return;

        // Check for pending local ops - don't overwrite if we have pending changes
        if (hasPendingOps(repository)) {
          const hasPending = await repository.hasPendingOp(date);
          if (hasPending) return;
        }

        // Don't overwrite local edits
        if (hasLocalEditsRef.current) return;

        const remoteContent = remoteNote.content ?? "";

        // Only notify if content actually changed
        if (remoteContent !== localContentRef.current) {
          onRemoteUpdate?.(remoteContent);
        }
      })
      .catch((error) => {
        console.error("Failed to refresh note from remote:", error);
      });
  }, [date, repository, online, isLocalReady, onRemoteUpdate]);

  // Auto-trigger refresh when going online or when local load completes
  useEffect(() => {
    if (online && isLocalReady && localContent !== "") {
      // Only refresh if we have local content (i.e., note exists)
      // For new notes, no need to refresh
      triggerRefresh();
    }
  }, [online, isLocalReady, triggerRefresh, localContent]);

  return {
    isKnownRemoteOnly,
    triggerRefresh,
  };
}
