# DailyNote - Project Guide

## Overview

DailyNote is a minimalist daily notes app with a year-at-a-glance calendar. It is local-first with optional cloud sync. Notes are encrypted client-side and stored in IndexedDB. Only today's note is editable; past notes are read-only; future dates are disabled.

## Development Workflow

### Bug Fixing Process

When fixing a bug, always follow this process:

1. **Create a test reproducing the bug first** — Write a failing test that demonstrates the bug before making any code changes. This ensures you understand the bug and provides a regression test.
2. **Fix the bug** — Make the minimal changes needed to fix the issue.
3. **Verify the test passes** — Run the test to confirm the fix works.
4. **Run all tests** — Ensure no regressions with `npm test`.
5. **Run type check** — Verify no type errors with `npm run typecheck`.

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

## Key Patterns

### Error Handling

The codebase uses a functional `Result<T, E>` pattern in the domain layer:

```typescript
// src/domain/result.ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Domain-specific error types are discriminated unions in `src/domain/errors.ts`:

- `StorageError`: NotFound, Corrupt, IO, Unknown
- `CryptoError`: KeyMissing, EncryptFailed, DecryptFailed, Unknown
- `SyncError`: Offline, Conflict, RemoteRejected, Unknown
- `VaultError`: VaultLocked, KeyMissing, UnlockFailed, Unknown

**Inconsistency warning**: Result pattern is used in sync/gateway code but NOT in repositories (which return `null` for errors) or hooks (which use try/catch). See `docs/effect-refactoring.md` for planned unification.

### Async Patterns

Hooks use a `cancelled` flag pattern for cleanup:

```typescript
useEffect(() => {
  let cancelled = false;
  const load = async () => {
    const result = await repository.get(date);
    if (!cancelled) dispatch({ type: "LOAD_SUCCESS", result });
  };
  void load();
  return () => {
    cancelled = true;
  };
}, [date]);
```

**Known issue**: This pattern prevents state updates but doesn't cancel in-flight operations. The operation runs to completion and the result is discarded.

### Dependency Injection

- Domain layer defines interfaces (`Clock`, `Connectivity`, `KeyringProvider`, `SyncStateStore`)
- Infrastructure implements them (`src/storage/runtimeAdapters.ts`)
- React Context provides dependencies to hooks
- Factory functions compose dependencies (`src/domain/notes/repositoryFactory.ts`)

Some services are module-level singletons (`syncStateStore`, `pendingOpsSource`) while others are passed as parameters. This inconsistency is being addressed.

### State Machines

Sync uses a reducer-based state machine (`src/domain/sync/stateMachine.ts`):

```typescript
type SyncPhase = "disabled" | "offline" | "ready" | "syncing" | "error";
type SyncMachineEvent =
  | { type: "INPUTS_CHANGED"; inputs: SyncMachineInputs }
  | { type: "SYNC_REQUESTED"; intent: SyncIntent }
  | { type: "SYNC_DISPATCHED" }
  | { type: "SYNC_STARTED" }
  | { type: "SYNC_FINISHED"; status: SyncStatus };
```

Note content also uses a state machine in `useLocalNoteContent.ts`:

```typescript
type LocalNoteState =
  | { status: "idle"; ... }
  | { status: "loading"; ... }
  | { status: "ready"; ... }
  | { status: "error"; ... };
```

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

## Reference Docs

- `docs/app-spec.md` for full business logic and flows.
- `docs/architecture.md` for layer boundaries.
- `docs/data-flow.md` for local/cloud sync details.
- `docs/key-derivation.md` for KEK/DEK and unlock flow.
- `docs/effect-refactoring.md` for planned Effect adoption to fix async/cancellation issues.

## Known Issues and Technical Debt

### High-Severity Async Bugs

These are documented in detail in `docs/effect-refactoring.md`:

1. **useVault.ts:82-123** — `unlockingRef` not reset on cancellation; unlock can be permanently blocked
2. **useUnifiedMigration.ts:28-67** — `isMigrating` in deps + set inside effect; migration can get stuck
3. **useLocalNoteContent.ts:190-232** — Save queue captures stale repository/date; can save to wrong note
4. **useNoteRemoteSync.ts:153-187** — Refresh uses refs for current date, not target; update applied to wrong note

### Patterns to Avoid

- **Multiple useEffects on shared state**: Leads to race conditions. Prefer single effect with state machine.
- **Refs updated in one effect, read in async callbacks of another**: Values may be stale.
- **`cancelled` flag without actual operation cancellation**: Side effects still run; only state updates are skipped.
- **Fire-and-forget `void promise.then(...)`**: No tracking, no cancellation, no error handling.

### Areas Needing Refactoring

- **Error handling inconsistency**: Repositories return `null`, gateways return `Result`, hooks use try/catch.
- **Mixed DI patterns**: Some services are singletons, others are passed as params.
- **Large files**: `unifiedSyncedNoteRepository.ts` (668 lines) should be split.
- **No React Error Boundaries**: Runtime errors can crash the entire app.
