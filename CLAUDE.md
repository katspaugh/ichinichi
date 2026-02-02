# Ichinichi - Project Guide

## Overview

Ichinichi is a minimalist daily notes app with a year-at-a-glance calendar. It is local-first with optional cloud sync. Notes are encrypted client-side and stored in IndexedDB. Only today's note is editable; past notes are read-only; future dates are disabled.

## Core Rules

- One note per day, keyed by date string DD-MM-YYYY.
- Today editable only; past read-only; future not clickable.
- Empty note (no text and no images) deletes the note.
- URL params drive navigation: ?date=DD-MM-YYYY opens a note, ?year=YYYY opens calendar.
- Escape closes the note modal; left/right arrows navigate notes when not editing.

## Tech Stack

- React 18 + TypeScript
- Vite
- IndexedDB for local persistence
- Supabase for optional sync (auth, database, storage)
- CSS custom properties for theming

## Architecture Layers

- UI: `src/components` (pure views).
- Controllers: `src/controllers` (view models and orchestration).
- Domain: `src/domain` (use cases for notes, vault, sync).
- Infrastructure: `src/storage`, `src/services`, `src/lib` (crypto, persistence, backend).

## App Modes

- Local mode (default): single unified IndexedDB dataset; no account required.
- Cloud mode (opt-in): Supabase auth + encrypted sync; local cache remains source of truth.

## Data Model (src/types/index.ts)

- Note: date, content (sanitized HTML), updatedAt.
- SyncedNote: note + revision, serverUpdatedAt?, deleted?.
- NoteImage: id, noteDate, type (background|inline), filename, mimeType, width, height, size, createdAt.

## Storage and Encryption

- Unified IndexedDB database: `dailynotes-unified` with stores `notes`, `note_meta`, `images`, `image_meta`, `sync_state`.
- Notes and images are encrypted with AES-GCM; metadata stored separately.
- Vault meta: localStorage key `dailynote_vault_meta_v1`.
- Device key: non-exportable CryptoKey in IndexedDB (`dailynotes-vault`).
- Password wrapping uses PBKDF2 (SHA-256, 600k iterations).
- Cloud keyring stored in Supabase `user_keyrings`.
- Cloud DEK cache stored in localStorage `dailynote_cloud_dek_cache_v1`.
- Multi-key support: notes/images carry `key_id` to avoid re-encrypting on mode changes.

## Sync (Cloud Mode)

- Debounced sync on edits; immediate sync on note close and pagehide/beforeunload.
- Status: idle, syncing, synced, offline, error.
- Conflict resolution: revision wins; updatedAt breaks ties.
- Remote updates pulled by `server_updated_at` cursor; local pending ops pushed first.

## Editor and Images

- ContentEditable editor with HTML sanitization on save and load.
- Inline image upload supports paste/drop; images are compressed before upload.
- Inline images use `data-image-id` and URLs are resolved via `ImageUrlManager`.
- Saving indicator appears after idle; modal shows decrypting state until ready.

## UI Flows

- Intro modal on first run.
- Mode choice prompt once local notes exist.
- Local vault unlock modal when device key missing.
- Cloud auth modal for sign-in/sign-up.
- Vault error modal on unlock failures.

## Project Structure (high level)

```
src/
  components/        Calendar, NoteEditor, AppModals, SyncIndicator, AuthForm, VaultUnlock
  controllers/       useAppController, useAppModalsController
  contexts/          AppMode/UrlState/ActiveVault/NoteRepository providers
  domain/            notes, sync, vault use cases
  hooks/             note content/navigation/sync/auth/vault hooks
  services/          vaultService, syncService
  storage/           unified DB, crypto, repositories, keyring, sync
  utils/             date, note rules, sanitization, URL state, images
  styles/            reset/theme/components
  lib/               supabase client
  types/             shared types
```

## XState Rules

When writing or modifying XState machines, follow these rules to avoid runtime errors:

1. **Ban dot-path targets → use #id targets.**

   ```typescript
   // BAD: Error-prone string paths
   target: ".active.ready"
   target: ".disabled"

   // GOOD: Use explicit state IDs
   states: {
     disabled: { id: "disabled", ... },
     active: {
       states: {
         ready: { id: "ready", ... }
       }
     }
   }
   target: "#disabled"
   target: "#ready"
   ```

2. **Ban sendTo("id") → use actor references via system.get().**

   ```typescript
   // BAD: Throws if actor doesn't exist
   actions: sendTo("syncResources", { type: "SYNC_NOW" });

   // GOOD: Safe actor reference lookup
   actions: enqueueActions(({ system }) => {
     const actor = system.get("syncResources");
     if (actor) {
       actor.send({ type: "SYNC_NOW" });
     }
   });
   ```

3. **Prefer inline actions/guards; use setup() maps only when you need reuse.**

   ```typescript
   // BAD: String reference, error-prone, no type checking
   guard: "isOnline",
   actions: ["updateInputs", "setStatusIdle"],

   // GOOD: Inline with full type inference
   guard: ({ context }) => context.online,
   actions: assign(({ event }) => ({
     repository: event.repository,
     status: SyncStatus.Idle,
   })),
   ```

These patterns ensure:

- Compile-time checking where possible
- Runtime safety for actor communication
- Better type inference throughout

## Reference Docs

- `docs/app-spec.md` for full business logic and flows.
- `docs/architecture.md` for layer boundaries.
- `docs/data-flow.md` for local/cloud sync details.
- `docs/key-derivation.md` for KEK/DEK and unlock flow.
