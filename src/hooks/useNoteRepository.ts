import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import type { RepositoryError } from "../domain/errors";
import type { NoteRepository } from "../storage/noteRepository";
import type { ImageRepository } from "../storage/imageRepository";
import type { AppDatabase } from "../storage/rxdb/database";
import type { ReplicationHandle } from "../storage/rxdb/replication";
import { createAppDatabase } from "../storage/rxdb/database";
import { migrateLegacyData } from "../storage/legacyMigration";
import { legacyDBExists, openLegacyIDBSource } from "../storage/legacyIDBSource";
import { RxDBNoteRepository } from "../storage/rxdb/noteRepository";
import { RxDBImageRepository } from "../storage/rxdb/imageRepository";
import { startReplication, createImageCryptoAdapter, createRemoteBlobFetcher } from "../storage/rxdb/replication";
import { createNoteCrypto } from "../domain/crypto/noteCrypto";
import { AppMode } from "./useAppMode";
import { useServiceContext } from "../contexts/serviceContext";
import { SyncStatus } from "../types";
import type { Note, SavedWeather } from "../types";
import { reportError } from "../utils/errorReporter";

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

// ---------------------------------------------------------------------------
// Phase-gated reducer
// ---------------------------------------------------------------------------

type Phase =
  | "idle"          // No database yet
  | "opening"       // Creating/opening the database
  | "ready"         // DB open, repos available
  | "replicating";  // DB open + replication active

export interface NoteRepoState {
  phase: Phase;
  // Inputs (mirrored from props for reducer access)
  userId: string | null;
  mode: AppMode;
  vaultKey: CryptoKey | null;
  activeKeyId: string | null;
  date: string | null;
  year: number;
  // Database & repos
  db: AppDatabase | null;
  dbName: string | null;
  repository: NoteRepository | null;
  imageRepository: ImageRepository | null;
  // Replication
  replication: ReplicationHandle | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  // Note content
  note: Note | null;
  noteLoading: boolean;
  noteError: RepositoryError | null;
  // Weather
  weather: SavedWeather | null;
  // Local editing
  localContent: string;
  hasEdits: boolean;
  isSaving: boolean;
  // Note dates
  noteDates: Set<string>;
  // Soft delete
  isSoftDeleted: boolean;
  // Version
  repositoryVersion: number;
}

export type NoteRepoAction =
  | { type: "INPUTS_CHANGED"; userId: string | null; mode: AppMode; vaultKey: CryptoKey | null; activeKeyId: string | null; date: string | null; year: number }
  | { type: "DB_OPENED"; db: AppDatabase; dbName: string }
  | { type: "DB_FAILED" }
  | { type: "REPLICATION_STARTED"; replication: ReplicationHandle }
  | { type: "REPLICATION_STOPPED" }
  | { type: "SYNC_STATUS"; status: SyncStatus; error?: string | null }
  | { type: "NOTE_DOC_CHANGED"; note: Note | null; isSoftDeleted: boolean }
  | { type: "NOTE_ERROR"; error: RepositoryError }
  | { type: "NOTE_DATES_CHANGED"; dates: Set<string> }
  | { type: "CONTENT_EDITED"; content: string }
  | { type: "SAVE_STARTED" }
  | { type: "SAVE_COMPLETED"; error?: RepositoryError | null }
  | { type: "DATE_CHANGED_FLUSH" }
  | { type: "WEATHER_CHANGED"; weather: SavedWeather | null }
  | { type: "INVALIDATE_REPOSITORY" };

const initialState: NoteRepoState = {
  phase: "opening",
  userId: null,
  mode: AppMode.Local,
  vaultKey: null,
  activeKeyId: null,
  date: null,
  year: new Date().getFullYear(),
  db: null,
  dbName: null,
  repository: null,
  imageRepository: null,
  replication: null,
  syncStatus: SyncStatus.Idle,
  syncError: null,
  note: null,
  noteLoading: true,
  noteError: null,
  weather: null,
  localContent: "",
  hasEdits: false,
  isSaving: false,
  noteDates: new Set(),
  isSoftDeleted: false,
  repositoryVersion: 0,
};

function shouldReplicate(s: NoteRepoState): boolean {
  return s.mode === AppMode.Cloud && !!s.userId && !!s.vaultKey && !!s.activeKeyId && !!s.db;
}

export function noteRepoReducer(
  state: NoteRepoState,
  action: NoteRepoAction,
): NoteRepoState {
  switch (action.type) {
    case "INPUTS_CHANGED": {
      const dateChanged = action.date !== state.date;
      const userChanged = action.userId !== state.userId;
      const needsNewDb = userChanged && (action.userId ?? "local") !== state.dbName;

      let next: NoteRepoState = {
        ...state,
        userId: action.userId,
        mode: action.mode,
        vaultKey: action.vaultKey,
        activeKeyId: action.activeKeyId,
        date: action.date,
        year: action.year,
      };

      // Date changed: reset editing state, clear content.
      // The note subscription (Effect 4) will populate localContent
      // once the new date's document is loaded.
      if (dateChanged) {
        next = {
          ...next,
          hasEdits: false,
          localContent: "",
          note: null,
          noteLoading: true,
          noteError: null,
        };
      }

      // User changed: need new DB. Keep note/localContent/noteLoading
      // intact so the editor doesn't blank during the DB transition.
      if (needsNewDb) {
        return {
          ...next,
          phase: "opening",
          db: null,
          repository: null,
          imageRepository: null,
          replication: null,
          syncStatus: SyncStatus.Idle,
          syncError: null,
          noteDates: new Set(),
        };
      }

      // Auto-transition: if ready but should replicate, move to replicating
      if (next.phase === "ready" && shouldReplicate(next)) {
        return { ...next, phase: "replicating" };
      }

      // Auto-transition: if replicating but should not, back to ready
      if (next.phase === "replicating" && !shouldReplicate(next)) {
        return { ...next, phase: "ready", replication: null, syncStatus: SyncStatus.Idle, syncError: null };
      }

      return next;
    }

    case "DB_OPENED": {
      const next: NoteRepoState = {
        ...state,
        phase: "ready",
        db: action.db,
        dbName: action.dbName,
      };
      // Auto-transition to replicating if conditions met
      if (shouldReplicate(next)) {
        return { ...next, phase: "replicating" };
      }
      return next;
    }

    case "DB_FAILED":
      return { ...state, phase: "idle" };

    case "REPLICATION_STARTED":
      return { ...state, replication: action.replication };

    case "REPLICATION_STOPPED":
      return {
        ...state,
        replication: null,
        syncStatus: SyncStatus.Idle,
        syncError: null,
      };

    case "SYNC_STATUS":
      return {
        ...state,
        syncStatus: action.status,
        syncError: action.error ?? state.syncError,
      };

    case "NOTE_DOC_CHANGED": {
      const next: NoteRepoState = {
        ...state,
        note: action.note,
        noteLoading: false,
        weather: action.note?.weather ?? null,
        isSoftDeleted: action.isSoftDeleted,
      };
      // Sync local content from note when not editing.
      // Keep previous content when note is null (re-subscribe / query initializing)
      // to avoid blanking the editor during RxDB subscription churn.
      // Skip if content hasn't changed to avoid editor innerHTML resets
      // that cause cursor jumps and flicker from replication emissions.
      if (!state.hasEdits && action.note && action.note.content !== state.localContent) {
        next.localContent = action.note.content;
      }
      return next;
    }

    case "NOTE_ERROR":
      return { ...state, noteError: action.error };

    case "NOTE_DATES_CHANGED":
      return { ...state, noteDates: action.dates };

    case "CONTENT_EDITED":
      return { ...state, localContent: action.content, hasEdits: true };

    case "SAVE_STARTED":
      return { ...state, isSaving: true };

    case "SAVE_COMPLETED":
      return {
        ...state,
        isSaving: false,
        hasEdits: action.error ? state.hasEdits : false,
        noteError: action.error ?? null,
      };

    case "DATE_CHANGED_FLUSH":
      return { ...state, hasEdits: false };

    case "WEATHER_CHANGED":
      return { ...state, weather: action.weather };

    case "INVALIDATE_REPOSITORY":
      return { ...state, repositoryVersion: state.repositoryVersion + 1 };
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// v2: bumped from "ichinichi_legacy_migrated" because the initial RxDB cutover
// (#68) set that flag after silently migrating zero notes (the reader filtered
// on a plaintext `content` field that never existed — legacy rows were
// encrypted). Bumping the key forces a single retry for every device where the
// broken migration ran.
const LEGACY_MIGRATED_KEY = "ichinichi_legacy_migrated_v2";
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

  const [state, dispatch] = useReducer(noteRepoReducer, initialState);

  // Mutable refs kept in sync without an effect — written in callbacks/effects only
  const keyringRef = useRef(keyring);
  keyringRef.current = keyring;
  const localContentRef = useRef(state.localContent);
  localContentRef.current = state.localContent;
  const weatherRef = useRef(state.weather);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ date: string; content: string } | null>(null);
  const prevDateRef = useRef(date);

  // --- Effect 1: Forward prop changes into reducer + flush on date change ---
  useEffect(() => {
    // Flush pending save when date changes
    if (date !== prevDateRef.current) {
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
    }

    dispatch({
      type: "INPUTS_CHANGED",
      userId,
      mode,
      vaultKey,
      activeKeyId,
      date,
      year,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mode, vaultKey, activeKeyId, date, year]);

  // --- Effect 2: Phase "opening" - create database ---
  useEffect(() => {
    if (state.phase !== "opening") return;

    let cancelled = false;
    const dbName = state.userId ?? "local";

    void (async () => {
      try {
        const newDb = await createAppDatabase(dbName);
        if (cancelled) return;
        dispatch({ type: "DB_OPENED", db: newDb, dbName });
      } catch (error) {
        reportError("useNoteRepository.openDb", error);
        if (!cancelled) dispatch({ type: "DB_FAILED" });
      }
    })();

    return () => { cancelled = true; };
  }, [state.phase, state.userId]);

  // --- Effect 3: Phase "replicating" - start replication ---
  // Deps: phase, db, and activeKeyId. The phase gate ensures
  // userId/vaultKey/activeKeyId are present (the reducer won't transition to
  // "replicating" without them). activeKeyId is in the deps because the
  // keyProvider closure below captures it once at effect start; without
  // restarting on key change, a replication started while activeKeyId was
  // briefly the device-only DEK keeps encrypting with that key for the rest
  // of the session — pushing rows with a key_id no other device can decrypt.
  // vaultKey stays out of the deps because it's a CryptoKey object reference
  // that would churn on every parent re-render; activeKeyId is a stable
  // string compared by value.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  useEffect(() => {
    if (state.phase !== "replicating") return;
    if (!state.db) return;

    const currentUserId = userIdRef.current;
    const currentActiveKeyId = state.activeKeyId;
    if (!currentUserId || !currentActiveKeyId) return;

    const keyProvider = {
      activeKeyId: currentActiveKeyId,
      getKey: (keyId: string) => keyringRef.current.get(keyId) ?? null,
    };
    const e2ee = e2eeFactory.create(keyProvider);
    const crypto = createNoteCrypto(e2ee);

    const imageCrypto = createImageCryptoAdapter(e2ee);
    imageRepository?.setRemoteFetcher(createRemoteBlobFetcher(supabase, imageCrypto, currentUserId));
    const handle = startReplication(state.db, supabase, crypto, currentUserId, imageCrypto);
    dispatch({ type: "REPLICATION_STARTED", replication: handle });

    const subs: Array<{ unsubscribe(): void }> = [];

    // Track last emitted status to avoid redundant dispatches that cause re-renders
    let lastStatus: SyncStatus | null = null;

    subs.push(handle.notes.active$.subscribe((active) => {
      const next = active ? SyncStatus.Syncing : SyncStatus.Synced;
      if (next !== lastStatus) {
        lastStatus = next;
        dispatch({ type: "SYNC_STATUS", status: next });
      }
    }));

    subs.push(handle.notes.error$.subscribe((err) => {
      if (err && lastStatus !== SyncStatus.Error) {
        lastStatus = SyncStatus.Error;
        dispatch({
          type: "SYNC_STATUS",
          status: SyncStatus.Error,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }));

    // Subscribe to image replication errors too
    if (handle.images) {
      subs.push(handle.images.error$.subscribe((err) => {
        if (err) {
          reportError("imageReplication.error", err);
        }
      }));
    }

    return () => {
      subs.forEach((s) => s.unsubscribe());
      handle.cancel();
      // Don't clear the remote fetcher here — imageRepository's useMemo
      // already sets a fetcher at construction time, and nulling it on
      // replication restart leaves a window where on-demand blob fetches
      // silently return null (images load but fail to display).
      dispatch({ type: "REPLICATION_STOPPED" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.db, state.activeKeyId]);

  // --- Effect 3b: Legacy IndexedDB → RxDB migration ---
  // Runs once per device after both (a) the RxDB database is open and
  // (b) a keyring + active key are available, so encrypted legacy notes
  // can be decrypted. Keyed on LEGACY_MIGRATED_KEY to avoid re-running.
  useEffect(() => {
    if (!state.db) return;
    if (!activeKeyId || keyring.size === 0) return;
    if (typeof localStorage !== "undefined" && localStorage.getItem(LEGACY_MIGRATED_KEY)) return;

    let cancelled = false;
    const db = state.db;

    void (async () => {
      try {
        if (!(await legacyDBExists())) {
          if (!cancelled) localStorage.setItem(LEGACY_MIGRATED_KEY, "1");
          return;
        }

        const source = await openLegacyIDBSource();
        if (cancelled) {
          await source?.destroy();
          return;
        }
        if (!source) {
          localStorage.setItem(LEGACY_MIGRATED_KEY, "1");
          return;
        }

        const e2ee = e2eeFactory.create({
          activeKeyId,
          getKey: (keyId: string) => keyringRef.current.get(keyId) ?? null,
        });

        const result = await migrateLegacyData(db, source, e2ee);
        if (cancelled) return;

        // Only mark as migrated if every note/image we found was migrated.
        // When some records failed (missing key), leave the flag unset so a
        // later session with more keys can pick them up.
        if (result.failedNotes === 0 && result.failedImages === 0) {
          localStorage.setItem(LEGACY_MIGRATED_KEY, "1");
        }
      } catch (error) {
        reportError("useNoteRepository.legacyMigration", error);
      }
    })();

    return () => { cancelled = true; };
  }, [state.db, activeKeyId, keyring, e2eeFactory]);

  // --- Effect 4: Subscribe to note document (content + soft-delete) ---
  useEffect(() => {
    if (!state.db || !state.date) {
      // Only mark "no note" when we have a DB but no date selected.
      // When db is null we're still opening — keep noteLoading true so
      // isEditable stays false and auto-focus doesn't fire on empty content.
      if (state.db && !state.date) {
        dispatch({ type: "NOTE_DOC_CHANGED", note: null, isSoftDeleted: false });
      }
      return;
    }

    // Track last emitted content to avoid redundant dispatches that cause
    // the editor to re-run its content sync effect (innerHTML reset + cursor jump).
    let lastContent: string | null = null;
    let lastIsDeleted: boolean | null = null;

    const subscription = state.db.notes.findOne(state.date).$.subscribe((doc) => {
      const content = doc && !doc.isDeleted ? doc.content : null;
      const isDeleted = doc?.isDeleted ?? false;

      // Skip dispatch if nothing changed — prevents editor flicker from replication churn
      if (content === lastContent && isDeleted === lastIsDeleted) return;
      lastContent = content;
      lastIsDeleted = isDeleted;

      if (!doc) {
        dispatch({ type: "NOTE_DOC_CHANGED", note: null, isSoftDeleted: false });
      } else if (doc.isDeleted) {
        dispatch({ type: "NOTE_DOC_CHANGED", note: null, isSoftDeleted: true });
      } else {
        dispatch({
          type: "NOTE_DOC_CHANGED",
          note: {
            date: doc.date,
            content: doc.content,
            updatedAt: doc.updatedAt,
            weather: doc.weather ?? undefined,
          },
          isSoftDeleted: false,
        });
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [state.db, state.date]);

  // --- Effect 5: Subscribe to note dates ---
  useEffect(() => {
    if (!state.db) {
      dispatch({ type: "NOTE_DATES_CHANGED", dates: new Set() });
      return;
    }

    const subscription = state.db.notes
      .find({ selector: { isDeleted: { $eq: false } } })
      .$.subscribe((docs) => {
        const yearStr = String(state.year);
        const filtered = docs
          .map((doc) => doc.date)
          .filter((d) => d.endsWith(yearStr));
        dispatch({ type: "NOTE_DATES_CHANGED", dates: new Set(filtered) });
      });

    return () => { subscription.unsubscribe(); };
  }, [state.db, state.year]);

  // --- Repositories (derived from db) ---
  const repository = useMemo<NoteRepository | null>(
    () => (state.db ? new RxDBNoteRepository(state.db) : null),
    [state.db],
  );
  const imageRepository = useMemo<RxDBImageRepository | null>(
    () => {
      if (!state.db) return null;
      const repo = new RxDBImageRepository(state.db);
      if (mode === AppMode.Cloud && activeKeyId && userId) {
        const keyProvider = {
          activeKeyId,
          getKey: (keyId: string) => keyringRef.current.get(keyId) ?? null,
        };
        const imageCrypto = createImageCryptoAdapter(e2eeFactory.create(keyProvider));
        repo.setRemoteFetcher(createRemoteBlobFetcher(supabase, imageCrypto, userId));
      }
      return repo;
    },
    [state.db, mode, activeKeyId, userId, supabase, e2eeFactory],
  );

  // --- Callbacks ---
  const setContent = useCallback(
    (newContent: string) => {
      dispatch({ type: "CONTENT_EDITED", content: newContent });
      localContentRef.current = newContent;

      if (!date || !repository) return;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      pendingSaveRef.current = { date, content: newContent };

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const pending = pendingSaveRef.current;
        if (!pending) return;
        pendingSaveRef.current = null;

        dispatch({ type: "SAVE_STARTED" });
        void repository.save(pending.date, pending.content, weatherRef.current).then((result) => {
          dispatch({
            type: "SAVE_COMPLETED",
            error: result.ok ? null : result.error,
          });
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

  const setWeather = useCallback(
    (w: SavedWeather | null) => {
      dispatch({ type: "WEATHER_CHANGED", weather: w });
      weatherRef.current = w;
      if (date && repository) {
        void repository.saveWeather?.(date, w);
      }
    },
    [date, repository],
  );

  const restoreNote = useCallback(() => {
    if (!date || !repository) return;
    void repository.restoreNote?.(date);
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
    () => {
      if (state.replication) {
        void state.replication.notes.reSync();
      }
    },
    [state.replication],
  );

  const queueIdleSync = useCallback(
    () => {
      if (state.replication) {
        void state.replication.notes.reSync();
      }
    },
    [state.replication],
  );

  const invalidateRepository = useCallback(() => {
    dispatch({ type: "INVALIDATE_REPOSITORY" });
  }, []);

  const hasNote = useCallback(
    (checkDate: string): boolean => state.noteDates.has(checkDate),
    [state.noteDates],
  );

  const refreshNoteDates = useCallback(() => {
    // With RxDB reactive subscriptions, dates auto-update.
    // This is a no-op kept for interface compatibility.
  }, []);

  // --- Derived state ---
  // Decouple from state.db to prevent isEditable toggling during DB transitions.
  // When db goes null (needsNewDb), isEditable would flip false→true, resetting
  // hasAutoFocusedRef and triggering placeCaretAtEnd + innerHTML reset on re-open.
  const isDecrypting = state.noteLoading;
  const isContentReady = !state.noteLoading;
  const isOfflineStub = false;

  return {
    repository,
    imageRepository,
    syncedRepo: null,
    syncStatus: state.syncStatus,
    syncError: state.syncError,
    triggerSync,
    queueIdleSync,
    pendingOps: { notes: 0, images: 0, total: 0 },
    capabilities,
    content: state.localContent,
    setContent,
    hasEdits: state.hasEdits,
    isSaving: state.isSaving,
    hasNote,
    noteDates: state.noteDates,
    refreshNoteDates,
    isDecrypting,
    isContentReady,
    isOfflineStub,
    isSoftDeleted: state.isSoftDeleted,
    restoreNote,
    noteError: state.noteError,
    repositoryVersion: state.repositoryVersion,
    invalidateRepository,
    weather: state.weather,
    setWeather,
  };
}
