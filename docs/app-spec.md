# DailyNote App Spec (Business Logic, Flows, Features)

This document specifies business logic, flows, and features of DailyNote.
It is derived from the current codebase with file references.

## 1) Product Overview

- Minimal daily notes app: one note per day, year-at-a-glance calendar.
- Local-first; optional cloud sync.
- Notes encrypted client-side; past notes read-only; only today editable.

Refs: src/App.tsx, src/README.md, src/utils/noteRules.ts

## 2) Core Data Model

### 2.1 Note

- date: "DD-MM-YYYY" string.
- content: sanitized HTML string.
- updatedAt: ISO timestamp.

Ref: src/types/index.ts

### 2.2 SyncedNote

- Adds: id?, revision, serverUpdatedAt?, deleted?.
- revision increments per local edit; used in conflict resolution.

Ref: src/types/index.ts

### 2.3 NoteImage

- id (UUID), noteDate (DD-MM-YYYY), type (background|inline), filename, mimeType,
  width, height, size, createdAt.

Ref: src/types/index.ts

## 3) Date and Calendar Rules

- Canonical date format: DD-MM-YYYY (e.g., 09-02-2025).
- Today is computed from local device time.
- Past days are clickable; future days are not.
- Only today's note can be edited.

Refs: src/utils/date.ts, src/utils/noteRules.ts, src/components/Calendar/DayCell.tsx

## 4) App Modes

### 4.1 Local Mode (default)

- Notes stored locally in a single unified IndexedDB dataset.
- No account required; local storage is the source of truth.

### 4.2 Cloud Mode (opt-in)

- Authenticated via Supabase.
- Cloud is a replica: notes are synced on save and during periodic sync.
- The same local dataset is used in both modes.

Refs: src/hooks/useAppMode.ts, src/hooks/useNoteRepository.ts

## 5) Authentication Flow (Supabase)

- signUp: creates user; if email confirmation required, user remains unauthenticated
  until confirmed.
- signIn: authenticates with email + password.
- signOut: clears session.
- Auth state controls mode: signed-in forces Cloud mode.

Refs: src/hooks/useAuth.ts, src/hooks/useAppMode.ts

## 6) Vault and Key Management

### 6.1 Vault Storage

- Vault metadata stored in localStorage: key dailynote_vault_meta_v1.
- Device key stored in IndexedDB: dailynotes-vault / keys.

Ref: src/storage/vault.ts

### 6.2 Local Vault

- On first load, if device key available, creates a random vault without asking for
  a password.
- If device key is unavailable, user must set a password to create the vault.
- Password uses PBKDF2 (SHA-256, 600k iterations) to wrap the DEK.
- Device-wrapped key stored when possible for auto-unlock.

Refs: src/hooks/useLocalVault.ts, src/storage/vault.ts

### 6.3 Cloud Vault

- On sign-in, tries to unlock with device-wrapped DEK first.
- If not available, uses password to derive KEK and unwrap DEKs from Supabase user_keyrings.
- New cloud users: generate DEK (or reuse local vault key), wrap with KEK, save to
  user_keyrings as primary.
- All locally known keys are uploaded to user_keyrings on sign-in.
- Device-wrapped DEK stored for future auto-unlock.

Refs: src/hooks/useVault.ts, src/storage/userKeyring.ts, src/storage/vault.ts

### 6.4 Cloud DEK Cache

- Cloud DEK is cached locally, encrypted with the local vault key.
- Stored in localStorage as dailynote_cloud_dek_cache_v1.

Ref: src/storage/cloudCache.ts

## 7) Storage Architecture

### 7.1 Unified Local Dataset

- IndexedDB: dailynotes-unified.
- Object stores: notes, note_meta, images, image_meta, sync_state.
- Notes stored encrypted (content only) with metadata in note_meta.
- Images stored encrypted locally with metadata in image_meta.
- Notes/images carry key_id to select the correct DEK.

Refs: src/storage/unifiedDb.ts, src/storage/unifiedNoteRepository.ts,
src/storage/unifiedImageRepository.ts

### 7.2 Cloud Replication (Supabase)

- Notes replicated to Supabase notes table (encrypted client-side).
- Images uploaded as encrypted blobs to Supabase Storage.
- note_images stores metadata for ciphertext blobs and thumbnails.
- user_keyrings stores wrapped DEKs (multi-key support).
- note key_id indicates which DEK to use for decryption.

Refs: src/storage/unifiedSyncedNoteRepository.ts, src/storage/unifiedImageSyncService.ts,
supabase/migrations/20260201_update_note_images_for_encryption.sql

## 8) Note Editing and Sanitization

- ContentEditable editor stores HTML.
- HTML sanitized before save and after decrypt.
- Allowed tags: basic formatting + img. Allowed attrs: data-image-id, alt, width, height.
- Empty content (no text, no images) deletes the note.

Refs: src/utils/sanitize.ts, src/components/NoteEditor/useContentEditable.ts,
src/hooks/useNoteContent.ts

## 9) Autosave and UI States

- Content saves after 400ms debounce.
- "Saving..." indicator appears after 2s idle and hides after 1.2s.
- Decrypting state shown before content is ready.

Refs: src/hooks/useNoteContent.ts, src/components/NoteEditor/useSavingIndicator.ts,
src/components/NoteEditor/NoteEditor.tsx

## 10) Navigation and URL State

- URL params:
  - ?date=DD-MM-YYYY opens note view.
  - ?year=YYYY opens calendar view.
- If date param invalid or future, redirect to today.
- If no params, default to today, unless intro is shown.

Refs: src/hooks/useUrlState.ts, src/utils/urlState.ts

## 11) Note Navigation (Prev/Next)

- Navigable dates are all note dates plus today (even if empty).
- Prev/Next buttons, keyboard arrows (when not editing), swipe gestures on mobile.

Refs: src/hooks/useNoteNavigation.ts, src/hooks/useNoteKeyboardNav.ts,
src/hooks/useSwipeGesture.ts, src/utils/noteNavigation.ts

## 12) Sync System (Cloud Mode)

### 12.1 Sync Triggering

- Debounced sync (2s) on changes.
- Immediate sync on closing note with edits.
- Immediate sync on pagehide/beforeunload.

Refs: src/hooks/useSync.ts, src/components/AppModals.tsx

### 12.2 Sync Status

- Idle, Syncing, Synced, Offline, Error.

Refs: src/types/index.ts, src/components/SyncIndicator/SyncIndicator.tsx

### 12.3 Conflict Resolution

- Last-write-wins by updatedAt timestamp.
- Tie-breaker: higher revision wins.

Ref: src/storage/unifiedSyncedNoteRepository.ts

### 12.4 Sync Algorithm (High Level)

1. If offline, set status to Offline, return.
2. Push pending local ops (upsert/delete) to Supabase.
3. Pull remote updates using cursor (server_updated_at > last cursor).
4. Apply remote updates only when newer; never infer deletions from missing index.

Ref: src/storage/unifiedSyncedNoteRepository.ts

### 12.5 Optimistic Concurrency

- Remote updates use server_updated_at to detect conflicts.
- Conflict triggers re-fetch and resolution.

Ref: src/storage/remoteNotesGateway.ts

## 13) Legacy Migration

- Legacy migration has been removed; unified storage is now the single source
  of truth for local and synced notes/images.
- E2EE boundary: storage persists encrypted envelopes only; plaintext is
  hydrated in domain repositories via the E2EE service.

Ref: src/services/e2eeService.ts

## 14) Inline Images

- Paste/drop image inserts placeholder with data-image-id="uploading".
- Upload returns image ID, placeholder replaced with data-image-id.
- Image URLs resolved at render time based on repository (local blob URL or
  Supabase signed URL).

Refs: src/components/NoteEditor/useContentEditable.ts,
src/components/NoteEditor/useInlineImages.ts,
src/utils/imageResolver.ts

## 15) UI Modals and Flows

- Intro modal (first run) to start writing or set up sync.
- Mode choice modal after first local note exists.
- Local vault unlock modal if required.
- Cloud auth modal for sign-in/sign-up or confirmation.
- Vault error modal if unlock fails.

Refs: src/components/AppModals.tsx

---

# Sync-Focused Diagnostics (Potential Bug Vectors)

This section highlights systemic issues and edge cases that can affect sync
correctness and data consistency.

## A) Delete Semantics and Missing Remote Index

- In sync, missing remote dates are treated as deletions for local notes, but only
  if the remote index is non-empty.
- If the remote index is empty due to transient errors or slow propagation, this
  prevents wipes but can leave stale notes un-deleted.

Ref: src/storage/unifiedSyncedNoteRepository.ts

## B) Dirty Notes and Offline Reads

- If a local note is dirty, get() returns the local version and skips remote fetch.
- This can cause the UI to show stale content if a remote update exists but local
  dirty flag remains true (e.g., interrupted sync).

Ref: src/storage/unifiedSyncedNoteRepository.ts

## C) Conflict Resolution and UpdatedAt Accuracy

- Conflict resolution depends on updatedAt timestamps, which are client-generated.
- Clock drift between devices can cause a device to win incorrectly.

Ref: src/storage/remoteNotesGateway.ts

## D) Revision Conflicts

- Push uses server_updated_at for optimistic concurrency.
- If server_updated_at is null or mismatched due to previous client state, the
  update can fail and fall into conflict handling.

Ref: src/storage/remoteNotesGateway.ts

## E) Dirty Flag Handling

- Dirty is set on save and cleared only after sync updates local note.
- If sync fails mid-cycle, dirty may remain true and block later remote updates.

Ref: src/storage/unifiedSyncedNoteRepository.ts

## F) Migration Timing

- Unified migration should complete before sync begins, otherwise ordering
  issues can cause duplicate updates or conflict resolution on incomplete data.

Ref: src/storage/unifiedMigration.ts

## G) Cloud Key Caching

- Cloud DEK cached with local vault key. If local vault rotates or is reset,
  cached cloud key becomes unreadable.
- Device-wrapped DEK is the primary fallback but might not exist on some browsers.

Refs: src/storage/cloudCache.ts, src/storage/vault.ts

## H) Image Sync Consistency

- Images are unencrypted in cloud mode; note content references images via
  data-image-id with no explicit sync ordering.
- A note can reference an image ID that failed to upload or was deleted,
  resulting in broken inline images.

Refs: src/storage/cloudImageStorage.ts, src/utils/imageResolver.ts

## I) Note Dates Source

- Date lists are derived from the notes table (local cache after sync).
- No separate index table is maintained, so date presence matches note records.

## J) Content Sanitization Differences

- Content is sanitized on save and on decrypt.
- If sanitize rules change, previously stored content could render differently
  between local and remote versions, producing subtle diffs.

Ref: src/utils/sanitize.ts

---

# Reimplementation Checklist (Condensed)

- Same date format and edit rules.
- Same vault flows and storage locations.
- Same IndexedDB schemas and encryption routines.
- Same sync algorithm and conflict resolution.
- Same URL routing and modal flows.
- Same inline image upload + resolution behavior.
