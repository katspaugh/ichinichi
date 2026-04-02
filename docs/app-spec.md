# Ichinichi App Spec (Business Logic, Flows, Features)

This document specifies business logic, flows, and features of Ichinichi.
It is derived from the current codebase with file references.

## 1) Product Overview

- Minimal daily notes app: one note per day, year-at-a-glance calendar.
- Cloud-only with E2EE. Auth required before any content.
- Notes encrypted client-side; past notes read-only; only today editable.
- Offline signed-in users can read cached entries from IndexedDB but cannot write. Editor becomes read-only.

Refs: src/App.tsx, src/README.md, src/utils/noteRules.ts

## 2) Core Data Model

### 2.1 Note

- date: "DD-MM-YYYY" string.
- content: sanitized HTML string.
- updatedAt: ISO timestamp.

Ref: src/types/index.ts

### 2.2 CachedNoteRecord

- date, ciphertext, nonce, keyId, updatedAt, revision, remoteId.
- Stored in IndexedDB cache; populated from Supabase sync.

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

## 4) App Mode

Cloud-only. User must sign in before reading or writing. Supabase is the source of truth; IndexedDB serves as a read-only cache for offline access.

## 5) Authentication Flow (Supabase)

- signUp: creates user, generates DEK, wraps with password-derived KEK, stores keyring entry in Supabase user_keyrings. If email confirmation required, user remains unauthenticated until confirmed.
- signIn: authenticates with email + password, fetches keyring from Supabase, unwraps DEK using password-derived KEK.
- signOut: clears session and all cached data (IndexedDB, in-memory keys). Keeps UI preferences.

Refs: src/hooks/useAuth.ts

## 6) Key Management

- Single DEK per user, derived from login password via PBKDF2 (SHA-256, 600k iterations).
- DEK stored as a wrapped keyring entry in Supabase `user_keyrings` table (is_primary = true).
- On sign-up: generate DEK, wrap with password-derived KEK, store in user_keyrings.
- On sign-in: fetch keyring from Supabase, unwrap DEK using password-derived KEK.
- No local vault, no device key, no multi-key rotation.

Ref: src/crypto.ts

## 7) Storage Architecture

### 7.1 Supabase (Source of Truth)

- Notes stored in Supabase `notes` table (encrypted client-side, AES-GCM).
- Images uploaded as encrypted blobs to Supabase Storage bucket `note-images`.
- `user_keyrings` stores single wrapped DEK entry (is_primary = true).
- Writes go directly to Supabase.

### 7.2 IndexedDB Cache (Read-Only)

- Cache DB: `ichinichi-cache`.
- Object stores: notes, images, image_meta, sync_state.
- Populated via pull-only sync from Supabase.
- Used for offline read access only; no local writes.

Refs: src/storage/cache.ts, src/storage/remoteNotes.ts, src/storage/noteRepository.ts

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

## 12) Sync System

### 12.1 Model

- Pull-only: fetch notes since cursor from Supabase → update IndexedDB cache.
- Writes go directly to Supabase (no pending ops queue, no local dirty tracking).
- No conflict resolution needed — Supabase is single source of truth.

### 12.2 Sync Triggering

- On sign-in (initial sync).
- On window focus.
- Periodic (every 30s).
- On realtime event (Supabase realtime subscription on `notes` table).

### 12.3 Sync Status

- Idle, Syncing, Synced, Offline, Error.

Refs: src/hooks/useSync.ts, src/storage/remoteNotes.ts

## 13) Legacy Migration

- Legacy migration removed. Cloud-only architecture; no local-first migration needed.

## 14) Inline Images

- Paste/drop image inserts placeholder with data-image-id="uploading".
- Upload returns image ID, placeholder replaced with data-image-id.
- Image URLs resolved at render time based on repository (local blob URL or
  Supabase signed URL).

Refs: src/components/NoteEditor/useContentEditable.ts,
src/components/NoteEditor/useInlineImages.ts,
src/utils/imageResolver.ts

## 15) UI Modals and Flows

- Intro modal → auth required (sign-in / sign-up).
- Authenticated + DEK unlocked → app renders.
- Offline → read-only mode (visual indicator, save disabled).
- Sign-out → clear all cached data, show intro modal.

Refs: src/components/AppModals.tsx

---

# Known Edge Cases

## A) Image Reference Integrity

- A note can reference an image ID that failed to upload or was deleted,
  resulting in broken inline images.

## B) Content Sanitization Differences

- Content is sanitized on save and on decrypt.
- If sanitize rules change, previously stored content could render differently.

Ref: src/utils/sanitize.ts

## C) Offline Cache Staleness

- IndexedDB cache may be stale if user was offline for extended period.
- Cache is updated on next successful sync after reconnection.
