import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { RepositoryError } from "../domain/errors";
import type { NoteRepository } from "../storage/noteRepository";
import type { ImageRepository } from "../storage/imageRepository";
import type { AppDatabase } from "../storage/rxdb/database";
import type { ReplicationHandle } from "../storage/rxdb/replication";
import { createAppDatabase } from "../storage/rxdb/database";
import { RxDBNoteRepository } from "../storage/rxdb/noteRepository";
import { RxDBImageRepository } from "../storage/rxdb/imageRepository";
import { startReplication } from "../storage/rxdb/replication";
import { createNoteCrypto } from "../domain/crypto/noteCrypto";
import { AppMode } from "./useAppMode";
import { useServiceContext } from "../contexts/serviceContext";
import { SyncStatus } from "../types";
import type { Note, SavedWeather } from "../types";

interface UseNoteRepositoryProps {
  mode: AppMode;
  authUser: User | null;
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  activeKeyId: string | null;
  date: string | null;
  year: number;
}

export interface UseNoteRepositoryReturn {
  repository: NoteRepository | null;
  imageRepository: ImageRepository | null;
  syncedRepo: null;
  syncStatus: SyncStatus;
  syncError: string | null;
  triggerSync: (options?: { immediate?: boolean }) => void;
  queueIdleSync: (options?: { delayMs?: number }) => void;
  pendingOps: { notes: number; images: number; total: number };
  capabilities: { canSync: boolean; canUploadImages: boolean };
  content: string;
  setContent: (content: string) => void;
  hasEdits: boolean;
  isSaving: boolean;
  hasNote: (date: string) => boolean;
  noteDates: Set<string>;
  refreshNoteDates: (options?: { immediate?: boolean }) => void;
  isDecrypting: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
  isSoftDeleted: boolean;
  restoreNote: () => void;
  noteError: RepositoryError | null;
  repositoryVersion: number;
  invalidateRepository: () => void;
  weather: SavedWeather | null;
  setWeather: (weather: SavedWeather | null) => void;
}

const SAVE_DEBOUNCE_MS = 500;

export function useNoteRepository({
  mode,
  authUser,
  vaultKey,
  keyring,
  activeKeyId,
  date,
  year,
}: UseNoteRepositoryProps): UseNoteRepositoryReturn {
  const { supabase, e2eeFactory } = useServiceContext();
  const userId = authUser?.id ?? null;

  // --- Database lifecycle ---
  const [db, setDb] = useState<AppDatabase | null>(null);
  const dbNameRef = useRef<string | null>(null);

  useEffect(() => {
    const dbName = userId ?? "local";
    if (dbNameRef.current === dbName && db) return;

    let cancelled = false;
    let newDb: AppDatabase | null = null;

    void (async () => {
      // Close previous database if name changed
      if (db && dbNameRef.current !== dbName) {
        await db.close();
      }

      newDb = await createAppDatabase(dbName);
      if (cancelled) {
        await newDb.close();
        return;
      }
      dbNameRef.current = dbName;
      setDb(newDb);
    })();

    return () => {
      cancelled = true;
    };
    // We intentionally omit `db` to avoid re-creation loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Close database on unmount
  useEffect(() => {
    return () => {
      if (db) {
        void db.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Repositories ---
  const repository = useMemo<NoteRepository | null>(
    () => (db ? new RxDBNoteRepository(db) : null),
    [db],
  );
  const imageRepository = useMemo<ImageRepository | null>(
    () => (db ? new RxDBImageRepository(db) : null),
    [db],
  );

  // --- Replication ---
  const [replication, setReplication] = useState<ReplicationHandle | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(SyncStatus.Idle);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Keep keyring ref current for crypto operations
  const keyringRef = useRef(keyring);
  useEffect(() => {
    keyringRef.current = keyring;
  }, [keyring]);

  useEffect(() => {
    if (
      mode !== AppMode.Cloud ||
      !db ||
      !userId ||
      !vaultKey ||
      !activeKeyId
    ) {
      // Cancel existing replication
      if (replication) {
        replication.cancel();
        setReplication(null);
        setSyncStatus(SyncStatus.Idle);
        setSyncError(null);
      }
      return;
    }

    const keyProvider = {
      activeKeyId,
      getKey: (keyId: string) => keyringRef.current.get(keyId) ?? null,
    };
    const e2ee = e2eeFactory.create(keyProvider);
    const crypto = createNoteCrypto(e2ee);

    const handle = startReplication(db, supabase, crypto, userId);
    setReplication(handle);

    // Subscribe to replication status
    const activeSub = handle.notes.active$.subscribe((active) => {
      if (active) {
        setSyncStatus(SyncStatus.Syncing);
      } else {
        setSyncStatus((prev) =>
          prev === SyncStatus.Syncing ? SyncStatus.Synced : prev,
        );
      }
    });

    const errorSub = handle.notes.error$.subscribe((err) => {
      if (err) {
        setSyncStatus(SyncStatus.Error);
        setSyncError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      activeSub.unsubscribe();
      errorSub.unsubscribe();
      handle.cancel();
      setReplication(null);
      setSyncStatus(SyncStatus.Idle);
      setSyncError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, db, userId, vaultKey, activeKeyId, supabase, e2eeFactory]);

  // --- Note content subscription ---
  const [note, setNote] = useState<Note | null>(null);
  const [noteLoading, setNoteLoading] = useState(true);
  const [noteError, setNoteError] = useState<RepositoryError | null>(null);

  useEffect(() => {
    if (!db || !date) {
      setNote(null);
      setNoteLoading(false);
      return;
    }

    setNoteLoading(true);
    const subscription = db.notes.findOne(date).$.subscribe((doc) => {
      if (!doc || doc.isDeleted) {
        setNote(null);
      } else {
        setNote({
          date: doc.date,
          content: doc.content,
          updatedAt: doc.updatedAt,
          weather: doc.weather ?? undefined,
        });
      }
      setNoteLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [db, date]);

  // --- Weather state ---
  const [weather, setWeatherState] = useState<SavedWeather | null>(note?.weather ?? null);
  const weatherRef = useRef<SavedWeather | null>(null);

  // Sync weather from note document
  useEffect(() => {
    setWeatherState(note?.weather ?? null);
    weatherRef.current = note?.weather ?? null;
  }, [note]);

  const setWeather = useCallback(
    (w: SavedWeather | null) => {
      setWeatherState(w);
      weatherRef.current = w;
      // Save weather immediately with current content
      if (date && repository) {
        void repository.save(date, localContentRef.current, w);
      }
    },
    [date, repository],
  );

  // --- Local content editing with debounced save ---
  const [localContent, setLocalContent] = useState("");
  const localContentRef = useRef("");
  const [hasEdits, setHasEdits] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ date: string; content: string } | null>(null);

  // Sync local content when note changes from DB (and no local edits)
  useEffect(() => {
    if (!hasEdits) {
      const c = note?.content ?? "";
      setLocalContent(c);
      localContentRef.current = c;
    }
  }, [note, hasEdits]);

  // Reset edits on date change
  const prevDateRef = useRef(date);
  useEffect(() => {
    if (date !== prevDateRef.current) {
      // Flush pending save for previous date
      if (pendingSaveRef.current && repository) {
        const { date: saveDate, content: saveContent } = pendingSaveRef.current;
        pendingSaveRef.current = null;
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        void repository.save(saveDate, saveContent);
      }
      prevDateRef.current = date;
      setHasEdits(false);
      const c = note?.content ?? "";
      setLocalContent(c);
      localContentRef.current = c;
      setNoteError(null);
    }
  }, [date, note, repository]);

  const setContent = useCallback(
    (newContent: string) => {
      setLocalContent(newContent);
      localContentRef.current = newContent;
      setHasEdits(true);

      if (!date || !repository) return;

      // Clear existing timer
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      pendingSaveRef.current = { date, content: newContent };

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const pending = pendingSaveRef.current;
        if (!pending) return;
        pendingSaveRef.current = null;

        setIsSaving(true);
        void repository.save(pending.date, pending.content, weatherRef.current).then((result) => {
          setIsSaving(false);
          if (!result.ok) {
            setNoteError(result.error);
          } else {
            setHasEdits(false);
            setNoteError(null);
          }
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [date, repository],
  );

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // --- Note dates subscription ---
  const [noteDates, setNoteDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!db) {
      setNoteDates(new Set());
      return;
    }

    const subscription = db.notes
      .find({ selector: { isDeleted: false } })
      .$.subscribe((docs) => {
        const yearStr = String(year);
        const filtered = docs
          .map((doc) => doc.date)
          .filter((d) => d.endsWith(yearStr));
        setNoteDates(new Set(filtered));
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [db, year]);

  const hasNote = useCallback(
    (checkDate: string): boolean => noteDates.has(checkDate),
    [noteDates],
  );

  const refreshNoteDates = useCallback(() => {
    // With RxDB reactive subscriptions, dates auto-update.
    // This is a no-op kept for interface compatibility.
  }, []);

  // --- Soft delete support ---
  const [isSoftDeleted, setIsSoftDeleted] = useState(false);

  useEffect(() => {
    if (!db || !date) {
      setIsSoftDeleted(false);
      return;
    }

    const subscription = db.notes.findOne(date).$.subscribe((doc) => {
      setIsSoftDeleted(doc?.isDeleted === true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [db, date]);

  const restoreNote = useCallback(() => {
    if (!date || !repository) return;
    if ("restoreNote" in repository && typeof repository.restoreNote === "function") {
      void (repository as NoteRepository & { restoreNote(date: string): Promise<unknown> }).restoreNote(date);
    }
  }, [date, repository]);

  // --- Capabilities ---
  const isCloud = mode === AppMode.Cloud && !!userId && !!vaultKey;
  const capabilities = useMemo(
    () => ({
      canSync: isCloud,
      canUploadImages: !!imageRepository,
    }),
    [isCloud, imageRepository],
  );

  // --- Trigger sync / idle sync ---
  const triggerSync = useCallback(
    (_options?: { immediate?: boolean }) => {
      // RxDB replication is continuous; manual trigger re-syncs
      if (replication) {
        void replication.notes.reSync();
      }
    },
    [replication],
  );

  const queueIdleSync = useCallback(
    (_options?: { delayMs?: number }) => {
      if (replication) {
        void replication.notes.reSync();
      }
    },
    [replication],
  );

  // --- Repository version ---
  const [repositoryVersion, setRepositoryVersion] = useState(0);
  const invalidateRepository = useCallback(() => {
    setRepositoryVersion((v) => v + 1);
  }, []);

  // --- Derived state ---
  const isDecrypting = noteLoading || (date !== null && !db);
  const isContentReady = !noteLoading && !!db;
  const isOfflineStub = false; // RxDB local-first: always has local data

  const content = localContent;

  return {
    repository,
    imageRepository,
    syncedRepo: null,
    syncStatus,
    syncError,
    triggerSync,
    queueIdleSync,
    pendingOps: { notes: 0, images: 0, total: 0 },
    capabilities,
    content,
    setContent,
    hasEdits,
    isSaving,
    hasNote,
    noteDates,
    refreshNoteDates,
    isDecrypting,
    isContentReady,
    isOfflineStub,
    isSoftDeleted,
    restoreNote,
    noteError,
    repositoryVersion,
    invalidateRepository,
    weather,
    setWeather,
  };
}
