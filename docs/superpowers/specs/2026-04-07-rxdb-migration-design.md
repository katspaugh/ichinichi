# Migrate to RxDB + Supabase Plugin

Replace the custom sync engine, direct IndexedDB access, and Zustand stores with RxDB as the primary data layer. Goal: more robust, maintainable sync with less custom code. E2EE, auth, and keyring remain unchanged.

## RxDB Collections & Schemas

Two collections, one RxDB database per account (`ichinichi-{userId}`), using `getRxStorageDexie()`.

### `notes`

| Field       | Type    | Notes                          |
|-------------|---------|--------------------------------|
| `date`      | string  | Primary key (`DD-MM-YYYY`)     |
| `content`   | string  | Sanitized HTML, plaintext      |
| `updatedAt` | string  | ISO timestamp                  |
| `deleted`   | boolean | Soft delete for replication    |

### `images`

| Field       | Type    | Notes                          |
|-------------|---------|--------------------------------|
| `id`        | string  | Primary key (UUID)             |
| `noteDate`  | string  | Indexed, links to note         |
| `filename`  | string  |                                |
| `mimeType`  | string  |                                |
| `width`     | number  |                                |
| `height`    | number  |                                |
| `size`      | number  |                                |
| `createdAt` | string  | ISO timestamp                  |
| `deleted`   | boolean | Soft delete for replication    |

Image binary data stored as an RxDB attachment on the document.

### What disappears from IndexedDB

- `note_meta` store — RxDB replication handles revisions, pending ops, server timestamps internally.
- `sync_state` store — replication plugin manages its own checkpoint.
- `remote_note_index` store — derived from RxDB queries.

## E2EE in the Replication Pipeline

RxDB stores plaintext locally (enabling queries/reactivity). Supabase only ever sees ciphertext. Encryption happens in the replication plugin's push/pull modifiers.

### Push (local -> Supabase)

Plaintext doc -> modifier encrypts content with active DEK -> sends `{ date, key_id, ciphertext, nonce, updated_at, deleted }`.

### Pull (Supabase -> local)

Receives `{ date, key_id, ciphertext, nonce, updated_at, deleted }` -> modifier decrypts using keyring -> plaintext doc stored locally.

### Images

Same pattern. Push modifier: upload encrypted blob to storage bucket first, then push metadata row. Pull modifier: pull metadata row, then download encrypted blob from bucket into local RxDB attachment.

### Keyring dependency

Replication can only start after vault unlock (DEK available). If the vault locks, replication pauses. Matches current behavior.

### Unchanged modules

- `noteCrypto.ts` — encrypt/decrypt functions used inside modifiers
- `userKeyring.ts` — DEK management
- `vaultService` / `useVault` — vault unlock flow
- `cryptoUtils.ts` — primitives

## Supabase Schema Changes

SQL migration to adjust the backend for the rxdb-supabase plugin.

### `notes` table

- Rename `server_updated_at` -> `_modified` (or add as generated column)
- Add `_deleted` boolean (replaces `deleted_at` timestamp)
- Keep `key_id`, `ciphertext`, `nonce`
- Drop `revision` column — RxDB uses `_modified` for conflict resolution

### New `images` table (metadata only)

| Column      | Type      | Notes                              |
|-------------|-----------|------------------------------------|
| `id`        | UUID      | Primary key                        |
| `user_id`   | UUID      | FK to auth.users, RLS             |
| `note_date` | text      |                                    |
| `filename`  | text      |                                    |
| `mime_type` | text      |                                    |
| `width`     | integer   |                                    |
| `height`    | integer   |                                    |
| `size`      | integer   |                                    |
| `created_at`| timestamp |                                    |
| `_modified` | timestamp | Auto-set by trigger                |
| `_deleted`  | boolean   | Default false                      |

RLS policy: `auth.uid() = user_id`.

### `note-images` storage bucket

Stays as-is. Encrypted blobs remain in the bucket.

### What gets dropped

- `push_note()` RPC — replication plugin does direct upserts
- `delete_note()` RPC — soft delete via `_deleted = true`
- `set_server_updated_at` trigger renamed/adjusted to set `_modified`

## Replacing Zustand with RxDB Reactivity

### Stores removed

| Store               | Replacement                                                          |
|---------------------|----------------------------------------------------------------------|
| `noteContentStore`  | `db.notes.findOne(date).$` observable                                |
| `syncStore`         | `replicationState.error$`, `replicationState.active$`                |
| `noteDatesStore`    | `db.notes.find({ selector: { deleted: false } }).$`                  |
| `storeCoordinator`  | Not needed — RxDB is single source of truth                          |

### New hooks

- `useNote(date)` — subscribes to a single note document
- `useNoteDates(year?)` — subscribes to the set of dates with notes
- `useNoteImages(date)` — subscribes to images for a given note
- `useSyncStatus()` — subscribes to replication state

### Unchanged hooks

- `useVault` / `useVaultMachine` — phase-gated reducers
- `useAuth` — Supabase auth

## Component & Context Changes

### Contexts

- `NoteRepositoryProvider` -> **`RxDBProvider`**. Provides the RxDB database instance. Created after auth + vault unlock. Torn down on sign-out / vault lock.
- `ActiveVaultProvider` — stays, provides DEK to replication modifiers.
- `ServiceProvider` — simplified, no longer provides syncService or synced repository factories.
- `AppModeProvider` / `UrlStateProvider` — unchanged.

### Components

- `NoteEditor` — uses `useNote(date)` instead of `useNoteContent()`. Save calls `doc.patch()`.
- `Calendar` — uses `useNoteDates(year)` instead of Zustand-backed hook.
- `SyncIndicator` — uses `useSyncStatus()` wrapping replication state observables.
- `AppBootstrap` / `useAppController` — simplified: auth -> vault unlock -> create RxDB database -> start replication.

### Deleted files/directories

- `src/stores/` — entire directory
- `src/domain/sync/` — entire directory
- `src/storage/remoteNotesGateway.ts`
- `src/domain/notes/syncedNoteRepository.ts`
- `src/domain/notes/repositoryFactory.ts`
- `src/hooks/useSyncedFactories.ts`
- `src/storage/unifiedDb.ts`
- `src/storage/unifiedNoteStore.ts`
- `src/storage/unifiedSyncStateStore.ts`

## Data Migration

### Server-side (SQL migration)

Rename/restructure columns on `notes` table. Create `images` metadata table. Data stays in place — already encrypted.

### Client-side (local storage format conversion)

All users (local-only and cloud) get a local migration on first load after update.

1. Detect legacy database (`dailynotes-unified-{userId}` or similar).
2. Open legacy IndexedDB, read all `notes` + `note_meta` records.
3. For cloud users: decrypt each note using active keyring, insert plaintext into RxDB `notes` collection.
4. For local-only users: read plaintext directly, insert into RxDB.
5. Read all `images` + `image_meta`, insert metadata into RxDB `images` collection, copy attachment blobs.
6. Drop legacy database.
7. Replication starts normally. RxDB sees all docs as new, pushes them. Supabase upsert on primary key means no duplicates.

**Interruption safety:** If migration is interrupted, legacy DB still exists on next load -> re-run. RxDB upserts are idempotent.

**Pending unsynced changes:** Picked up by RxDB replication after migration.

Lives in `src/storage/legacyMigration.ts`, called from `AppBootstrap` before replication starts.

## Testing Strategy

### Unit tests

- RxDB database creation and collection schemas
- Push/pull modifiers (encryption/decryption roundtrip)
- New hooks (`useNote`, `useNoteDates`, `useNoteImages`, `useSyncStatus`) with `getRxStorageMemory()`
- Legacy migration logic

### Integration tests

- Full replication cycle: local write -> push encrypts -> Supabase -> pull decrypts
- Image sync: metadata replicates, blob uploads/downloads from storage bucket
- Vault lock/unlock pauses/resumes replication
- Account switch tears down and recreates RxDB instance

### Existing e2e tests (Playwright)

Should largely still pass. May need minor timing adjustments for RxDB observables vs Zustand.

## New Dependencies

- `rxdb` — core library
- `rxdb/plugins/storage-dexie` — IndexedDB adapter
- `rxdb/plugins/replication-supabase` — Supabase replication (verify this exists or use generic replication plugin with Supabase adapter)
- `rxjs` — required by RxDB for observables
