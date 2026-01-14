# Data Flow

This document explains how notes and images move between local storage and Supabase,
based on the current code paths in `src/storage` and `src/hooks`.

## Overview (Local-first)

- All note content and image blobs are encrypted client-side and stored in IndexedDB.
- Cloud mode syncs encrypted payloads to Supabase but never blocks local reads/writes.
- The calendar and editor are driven by local data first, then reconcile with remote.

High-level flow (Cloud mode):

```text
UI events
  |
  v
Local repositories (note/image) -> IndexedDB (dailynotes-unified)
  |                                   |
  | pendingOp flags                   | encrypted ciphertext + metadata
  v                                   |
Sync service (debounced + idle)       |
  |                                   |
  v                                   v
Supabase (notes table, note_images, Storage)
```

## Local storage

- Notes live in the `notes` store with a companion meta record:
  - `ciphertext`, `nonce`, `keyId` in `NoteRecord`.
  - `revision`, `serverUpdatedAt`, `pendingOp` in `NoteMetaRecord`.
- Images live in the `images` store with `ImageMetaRecord`.
- Remote date indexes (per year) are cached in `remote_note_index`.
- All encryption uses AES-GCM; images use a derived key per note key.

## Calendar dates (Cloud mode)

Calendar only needs date presence, not content. It merges:

1. Local note dates from IndexedDB.
2. Remote note dates from Supabase (`notes` table), scoped by year.

The remote date list is cached in `remote_note_index` for offline use.

```text
Calendar load (year=YYYY)
  |
  v
getLocalDatesForYear()  -> local dates
  |
  v
if online: fetchRemoteNoteDates() -> cache remote_note_index
if offline: read remote_note_index
  |
  v
merge(local, remote)
```

## Opening a note (Cloud mode)

Opening a note uses `getWithRefresh`:

1. Read local record + meta.
2. Render local content immediately (if present).
3. In background, fetch remote note for that date.
4. Reconcile and update local DB if needed.

```text
Open note
  |
  v
Local snapshot (record + meta)
  |
  +--> show local content immediately
  |
  v
Fetch remote note (if online)
  |
  v
Resolve conflict (revision first, updatedAt tie-break)
  |
  +--> remote wins: update IndexedDB and refresh UI
  |
  +--> local wins: push rebased revision to Supabase
```

Offline behavior:
- If the note only exists remotely (cached date index) and there is no local record,
  the UI shows an offline stub until online again.

## Saving and deleting notes

Edits are debounced and saved locally; sync happens asynchronously.

```text
Editor change
  |
  v
sanitize -> encrypt -> IndexedDB
  |
  v
NoteMeta.pendingOp = "upsert"
  |
  v
Sync service queues background sync
```

Delete (making today's note empty):

```text
Delete note
  |
  v
Delete local note record
NoteMeta.pendingOp = "delete" (cloud mode)
  |
  v
Sync service deletes remote and clears local metadata
```

## Sync loop (Cloud mode)

The sync service only runs when online and only pushes local pending changes.
Remote pulls happen on note-open and calendar-year fetch.

```text
queueSync() / queueIdleSync()
  |
  v
UnifiedSyncedNoteRepository.sync()
  |
  +--> for each note with pendingOp:
  |       pushRemoteNote()
  |       deleteRemoteNote() for pending deletes
  |       handle conflicts -> resolveConflict()
  |       update local meta (serverUpdatedAt, pendingOp=null)
  |
  +--> syncEncryptedImages()
  |
  v
SyncStatus = Synced | Error | Offline
```

Conflict resolution:
- Higher `revision` wins.
- If equal, newer `updatedAt` wins.
- Local winner is pushed with a rebased revision.

## Images (Cloud mode)

Images are encrypted locally and synced via Supabase Storage + `note_images`.

Upload path:

```text
Insert image
  |
  v
encrypt blob -> ImageRecord/ImageMeta (pendingOp="upload")
  |
  v
syncEncryptedImages()
  |
  +--> upload ciphertext to Storage
  +--> upsert metadata to note_images
  +--> mark pendingOp=null, store serverUpdatedAt
```

Download-on-demand path:

```text
Render note images
  |
  v
try local get(imageId)
  |
  +--> found: decrypt and render
  |
  +--> missing: fetch metadata -> download ciphertext -> store locally -> decrypt
```

Delete path:

```text
Delete image
  |
  v
ImageMeta.pendingOp = "delete"
  |
  v
syncEncryptedImages() -> delete Storage object + mark deleted row
```

## Where this lives in code

- Note sync/reconciliation: `src/storage/unifiedSyncedNoteRepository.ts`
- Remote note API: `src/storage/unifiedSyncService.ts`
- Sync scheduling: `src/services/syncService.ts`, `src/hooks/useSync.ts`
- Image sync: `src/storage/unifiedImageSyncService.ts`
- Image hydration: `src/storage/unifiedSyncedImageRepository.ts`
- Calendar remote index cache: `src/storage/remoteNoteIndexStore.ts`
