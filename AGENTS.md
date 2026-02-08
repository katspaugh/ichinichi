# Ichinichi

## Communication Style

Telegraph style in ALL output — user messages, reasoning, subagent prompts. Not code comments or doc files.

Rules:
- Drop articles (a, an, the), filler words, pleasantries
- No narration of own actions ("Let me...", "I'll now...", "Going to...")
- State what you're doing or found, not that you're about to do it
- Min tokens. Every word must earn its place.

**BAD** (wasteful):
- "Let me explore the editor layout and styles to understand the current setup."
- "I'll start by reading the configuration file to see what's there."
- "Now I'm going to run the tests to check for regressions."
- "Looking at the code, it seems like the issue might be related to..."

**GOOD** (telegraph):
- "Exploring editor layout + styles."
- "Reading config."
- "Running tests."
- "Issue: stale ref in save callback."

---

Minimalist daily notes app. Year-at-a-glance calendar. Local-first, optional cloud sync. Client-side encryption, IndexedDB. Today editable, past read-only, future disabled.

## Dev Workflow

### Bug Fix Process

1. Write failing test reproducing bug first
2. Fix with minimal changes
3. Verify test passes
4. `npm test` — no regressions
5. `npm run typecheck` — no type errors

## Core Rules

- One note/day, key: DD-MM-YYYY
- Empty note (no text, no images) → delete
- URL params: ?date=DD-MM-YYYY note, ?year=YYYY calendar
- Escape closes modal; arrows navigate when not editing

## Tech Stack

React 18 + TypeScript, Vite, IndexedDB, Supabase (optional sync), CSS custom properties

## Architecture

- UI: `src/components` — pure views
- Controllers: `src/controllers` — view models, orchestration
- Domain: `src/domain` — use cases (notes, vault, sync)
- Infra: `src/storage`, `src/services`, `src/lib` — crypto, persistence, backend

## Key Patterns

### Error Handling

Functional `Result<T, E>` in domain layer:

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Domain error types (discriminated unions in `src/domain/errors.ts`):
- StorageError: NotFound | Corrupt | IO | Unknown
- CryptoError: KeyMissing | EncryptFailed | DecryptFailed | Unknown
- SyncError: Offline | Conflict | RemoteRejected | Unknown
- VaultError: VaultLocked | KeyMissing | UnlockFailed | Unknown

**Inconsistency**: Result used in sync/gateway, NOT in repositories (return null) or hooks (try/catch). See `docs/effect-refactoring.md`.

### Async Pattern

Hooks use `cancelled` flag for cleanup:

```typescript
useEffect(() => {
  let cancelled = false;
  const load = async () => {
    const result = await repository.get(date);
    if (!cancelled) dispatch({ type: "LOAD_SUCCESS", result });
  };
  void load();
  return () => { cancelled = true; };
}, [date]);
```

**Caveat**: prevents state updates only, in-flight ops run to completion.

### DI

- Domain defines interfaces (Clock, Connectivity, KeyringProvider, SyncStateStore)
- Infra implements (`src/storage/runtimeAdapters.ts`)
- React Context provides to hooks
- Factories compose deps (`src/domain/notes/repositoryFactory.ts`)
- Some services module-level singletons, others param-passed (inconsistency being addressed)

### State Machines

Sync: reducer-based (`src/domain/sync/stateMachine.ts`):
```typescript
type SyncPhase = "disabled" | "offline" | "ready" | "syncing" | "error";
```

Note content: state machine in `useLocalNoteContent.ts`:
```typescript
type LocalNoteState = { status: "idle" | "loading" | "ready" | "error"; ... };
```

## App Modes

- Local (default): unified IndexedDB, no account
- Cloud (opt-in): Supabase auth + encrypted sync, local cache = source of truth

## Data Model (src/types/index.ts)

- Note: date, content (sanitized HTML), updatedAt
- SyncedNote: note + revision, serverUpdatedAt?, deleted?
- NoteImage: id, noteDate, type (background|inline), filename, mimeType, width, height, size, createdAt

## Storage & Encryption

- DB: `dailynotes-unified` → notes, note_meta, images, image_meta, sync_state
- AES-GCM; metadata separate
- Vault meta: localStorage `dailynote_vault_meta_v1`
- Device key: non-exportable CryptoKey in IndexedDB (`dailynotes-vault`)
- Password wrap: PBKDF2 SHA-256, 600k iterations
- Cloud keyring: Supabase `user_keyrings`
- Cloud DEK cache: localStorage `dailynote_cloud_dek_cache_v1`
- Multi-key: `key_id` on notes/images, no re-encrypt on mode change

## Sync (Cloud)

- Debounced on edit; immediate on close + pagehide/beforeunload
- Status: idle | syncing | synced | offline | error
- Conflict: revision wins, updatedAt tiebreak
- Pull by `server_updated_at` cursor; push pending ops first

## Editor & Images

- ContentEditable + HTML sanitization save/load
- Inline image: paste/drop, compressed
- `data-image-id` attrs, URLs via `ImageUrlManager`
- Saving indicator after idle; decrypting state until ready

## UI Flows

- Intro modal → first run
- Mode choice → local notes exist
- Vault unlock → device key missing
- Cloud auth → sign-in/sign-up
- Vault error → unlock failures

## Structure

```
src/
  components/    Calendar, NoteEditor, AppModals, SyncIndicator, AuthForm, VaultUnlock
  controllers/   useAppController, useAppModalsController
  contexts/      AppMode/UrlState/ActiveVault/NoteRepository providers
  domain/        notes, sync, vault use cases
  hooks/         note content/navigation/sync/auth/vault
  services/      vaultService, syncService
  storage/       unified DB, crypto, repositories, keyring, sync
  utils/         date, note rules, sanitization, URL state, images
  styles/        reset/theme/components
  lib/           supabase client
  types/         shared types
```

## XState Rules

1. **No dot-path targets → use #id targets**

   ```typescript
   // BAD
   target: ".active.ready"

   // GOOD
   states: { ready: { id: "ready" } }
   target: "#ready"
   ```

2. **No sendTo("id") → system.get() actor refs**

   ```typescript
   // BAD
   actions: sendTo("syncResources", { type: "SYNC_NOW" });

   // GOOD
   actions: enqueueActions(({ system }) => {
     system.get("syncResources")?.send({ type: "SYNC_NOW" });
   });
   ```

3. **Inline actions/guards preferred; setup() maps only for reuse**

   ```typescript
   // BAD
   guard: "isOnline"

   // GOOD
   guard: ({ context }) => context.online,
   ```

## Agent Workflow

Run build/lint/typecheck/tests via Haiku subagent (`model: "haiku"`). Never run directly in main agent — saves context tokens.

```typescript
Task tool: subagent_type: "Bash", model: "haiku"
prompt: "Run `npm run typecheck` and report errors or confirm pass."
```

## Reference Docs

- `docs/app-spec.md` — business logic, flows
- `docs/architecture.md` — layer boundaries
- `docs/data-flow.md` — local/cloud sync
- `docs/key-derivation.md` — KEK/DEK, unlock flow
- `docs/effect-refactoring.md` — planned Effect adoption

## Known Issues & Tech Debt

### High-Severity Async Bugs

Detailed in `docs/effect-refactoring.md`:

1. **useVault.ts:82-123** — `unlockingRef` not reset on cancel; unlock permanently blocked
2. **useUnifiedMigration.ts:28-67** — `isMigrating` in deps + set in effect; migration stuck
3. **useLocalNoteContent.ts:190-232** — save queue captures stale repo/date; saves wrong note
4. **useNoteRemoteSync.ts:153-187** — refresh uses refs for current date not target; wrong note update

### Patterns to Avoid

- Multiple useEffects on shared state → race conditions; prefer single effect + state machine
- Refs updated in one effect, read in async callback of another → stale values
- `cancelled` flag without operation cancellation → side effects still run
- Fire-and-forget `void promise.then(...)` → no tracking/cancellation/error handling

### Refactoring Needed

- Error handling inconsistent: repos null, gateways Result, hooks try/catch
- Mixed DI: some singletons, some param-passed
- `unifiedSyncedNoteRepository.ts` (668 lines) → split
- No React Error Boundaries → runtime crash kills app
