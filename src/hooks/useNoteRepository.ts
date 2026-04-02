import { useCallback, useEffect, useMemo } from "react";
import type { RepositoryError } from "../domain/errors";
import { useNoteContent, type UseNoteContentReturn } from "./useNoteContent";
import { useNoteDates } from "./useNoteDates";
import { useSync, type UseSyncReturn } from "./useSync";
import { createNoteRepository, type NoteRepository } from "../storage/noteRepository";
import { createRemoteNotes } from "../storage/remoteNotes";
import { supabase } from "../lib/supabase";
import { connectivity } from "../services/connectivity";
import { noteContentStore } from "../stores/noteContentStore";

interface UseNoteRepositoryProps {
  userId: string | null;
  dek: CryptoKey | null;
  keyId: string | null;
  date: string | null;
  year: number;
}

export interface UseNoteRepositoryReturn {
  repository: NoteRepository | null;
  syncStatus: UseSyncReturn["syncStatus"];
  triggerSync: UseSyncReturn["triggerSync"];
  content: string;
  setContent: (content: string) => void;
  hasEdits: boolean;
  isSaving: boolean;
  hasNote: (date: string) => boolean;
  noteDates: Set<string>;
  refreshNoteDates: (options?: { immediate?: boolean }) => void;
  isDecrypting: boolean;
  isContentReady: boolean;
  noteError: RepositoryError | null;
}

export function useNoteRepository({
  userId,
  dek,
  keyId,
  date,
  year,
}: UseNoteRepositoryProps): UseNoteRepositoryReturn {
  const remote = useMemo(
    () => (userId ? createRemoteNotes(supabase, userId) : null),
    [userId],
  );

  const repository = useMemo(
    () =>
      dek && keyId && remote
        ? createNoteRepository({ dek, keyId, remote, connectivity })
        : null,
    [dek, keyId, remote],
  );

  const enabled = !!remote && !!repository;

  const { hasNote, noteDates, refreshNoteDates, applyNoteChange } =
    useNoteDates(repository, year);

  const handleSyncComplete = useCallback(() => {
    refreshNoteDates({ immediate: true });
    void noteContentStore.getState().reloadFromLocal();
  }, [refreshNoteDates]);

  const { syncStatus, triggerSync } = useSync({
    remote,
    supabase: enabled ? supabase : null,
    userId,
    enabled,
    onSyncComplete: handleSyncComplete,
  });

  const handleAfterSave = useCallback(
    (snapshot: { date: string; isEmpty: boolean }) => {
      applyNoteChange(snapshot.date, snapshot.isEmpty);
    },
    [applyNoteChange],
  );

  const {
    content,
    setContent,
    isDecrypting,
    hasEdits,
    isSaving,
    isContentReady,
    error: noteError,
  } = useNoteContent(date, repository, handleAfterSave);

  return {
    repository,
    syncStatus,
    triggerSync,
    content,
    setContent,
    hasEdits,
    isSaving,
    hasNote,
    noteDates,
    refreshNoteDates,
    isDecrypting,
    isContentReady,
    noteError,
  };
}
