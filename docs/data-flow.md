# Data Flow

This document explains how notes and images move between local storage and Supabase.

## Overview

DailyNote is local-first. All notes and images are encrypted on-device and stored in IndexedDB.
In Cloud mode, encrypted data is synced to Supabase. When you open a note, the app shows the
local version immediately, then reconciles with the server in the background.

## Local storage

- Notes and metadata live in `dailynotes-unified` IndexedDB.
- Notes are encrypted with AES-GCM and stored as ciphertext + nonce.
- Image blobs are encrypted, stored locally, and tracked with metadata.
- Metadata records carry the note `revision`, `updated_at`, and pending sync state.

## Calendar dates (Cloud mode)

1. Fetch the list of note dates from Supabase (`notes` table, `date` only).
2. Merge with local dates, including unsynced local notes.
3. Exclude locally deleted dates.

This allows the calendar to render without downloading note content.

## Opening a note (Cloud mode)

1. Read local note + metadata from IndexedDB.
2. Show the local content immediately (if present).
3. In the background, fetch the remote note for that date.
4. Reconcile using `revision` as the primary authority:
   - Higher revision wins.
   - If revisions match, `updated_at` breaks the tie.
5. If local is newer, push it to Supabase.
6. If remote is newer, update local IndexedDB and refresh the editor view.

If the device is offline, only local data is used.

## Saving a note

- Edits are debounced and saved to IndexedDB.
- The note metadata is marked with `pendingOp: 'upsert'`.
- Sync runs in the background when online.

## Deleting a note

- Local delete sets `pendingOp: 'delete'` in metadata.
- Sync propagates the deletion to Supabase.

## Image sync (Cloud mode)

- Images are encrypted locally, stored in IndexedDB, and queued for upload.
- Sync uploads encrypted blobs to Supabase Storage and writes metadata to `note_images`.
- When a note is opened on a new device, images are downloaded and hydrated into IndexedDB
  on demand so they can be decrypted and shown locally.

## Notes on reconciliation

- `revision` is the source of truth for conflict resolution.
- Server updates are pulled only when needed (per-note on open).
- Local updates are pushed when `pendingOp` is set or when local revision is newer.
