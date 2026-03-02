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

**Inconsistency**: Result used in sync/gateway, NOT in repositories (return null) or hooks (try/catch).

### Async Pattern

Zustand stores use generation counters for async cancellation:

```typescript
let _loadGeneration = 0;

const _loadNote = async (date: string, repository: NoteRepository) => {
  const gen = ++_loadGeneration;
  const result = await repository.get(date);
  if (gen !== _loadGeneration) return; // superseded by newer call
  set({ content: result.value?.content ?? "" });
};
```

After every `await`, re-read state via `get()` — never close over stale values.

Stores also use a `_disposed` flag (checked after each `await`) to prevent post-dispose state updates from in-flight async operations.

### DI

- Domain defines interfaces (Clock, Connectivity, KeyringProvider, SyncStateStore)
- Infra implements (`src/storage/runtimeAdapters.ts`)
- React Context provides to hooks
- Factories compose deps (`src/domain/notes/repositoryFactory.ts`)
- Some services module-level singletons, others param-passed (inconsistency being addressed)

### State Management

**Zustand stores** (`src/stores/`) manage hook-layer orchestration:
- `noteContentStore.ts` — note lifecycle, save queue, remote refresh
- `syncStore.ts` — sync orchestration, Realtime subscription, periodic sync
- `noteDatesStore.ts` — calendar dot state

Thin React hook wrappers in `src/hooks/` subscribe to store slices via `useSyncExternalStore`.

**XState** still used for vault/auth flows (`activeVaultMachine`).

**Domain state machine** (`src/domain/sync/stateMachine.ts`):
```typescript
type SyncPhase = "disabled" | "offline" | "ready" | "syncing" | "error";
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
  stores/        Zustand vanilla stores (noteContent, sync, noteDates)
  hooks/         thin wrappers over stores + auth/vault hooks
  services/      vaultService, syncService
  storage/       unified DB, crypto, repositories, keyring, sync
  utils/         date, note rules, sanitization, URL state, images
  styles/        reset/theme/components
  lib/           supabase client
  types/         shared types
```

## XState Rules (vault/auth only)

XState is only used for vault/auth flows. For new hook orchestration, use Zustand stores.

1. **No dot-path targets → use #id targets**
2. **No sendTo("id") → system.get() actor refs**
3. **Inline actions/guards preferred; setup() maps only for reuse**

## Agent Workflow

Run build/lint/typecheck/tests via Haiku subagent (`model: "haiku"`). Never run directly in main agent — saves context tokens.

```typescript
Task tool: subagent_type: "Bash", model: "haiku"
prompt: "Run `npm run typecheck` and report errors or confirm pass."
```

## Reference Docs

- `docs/app-spec.md` — business logic, flows
- `docs/architecture.md` — layer boundaries
- `docs/architecture-critique.md` — improvement proposals
- `docs/data-flow.md` — local/cloud sync
- `docs/key-derivation.md` — KEK/DEK, unlock flow
- ~~`docs/effect-refactoring.md`~~ — deleted, superseded by Zustand migration

## Known Issues & Tech Debt

### Remaining Async Bugs

1. **useVault.ts:82-123** — `unlockingRef` not reset on cancel; unlock permanently blocked
2. **useUnifiedMigration.ts:28-67** — `isMigrating` in deps + set in effect; migration stuck

### Fixed by Zustand Migration (March 2026)

The hook orchestration layer was rewritten from XState-based hooks to Zustand stores.
Old XState hook files (`useLocalNoteContent.ts`, `useNoteRemoteSync.ts`, `useSyncMachine.ts`, `useNoteRepositoryMachine.ts`) and their tests have been deleted.

Bugs fixed:
- Save queue capturing stale repo/date → store reads `get()` at execution time
- Remote refresh applying to wrong note → re-reads `get().date` after every `await`
- `flushPendingSave` fire-and-forget → `flushSave()` returns awaitable `Promise<void>`
- Stale closures from multiple useEffects → all state in store via `get()`
- React 18 batching workaround → Zustand updates are synchronous

### Patterns to Avoid

- Multiple useEffects on shared state → race conditions; prefer Zustand store
- Refs updated in one effect, read in async callback of another → stale values
- `cancelled` flag without operation cancellation → side effects still run
- Fire-and-forget `void promise.then(...)` → no tracking/cancellation/error handling

### Refactoring Needed

- Error handling inconsistent: repos null, gateways Result, hooks try/catch
- Mixed DI: some singletons, some param-passed
- `unifiedSyncedNoteRepository.ts` (668 lines) → split
- No React Error Boundaries → runtime crash kills app


## grepai - Semantic Code Search

**IMPORTANT: You MUST use grepai as your PRIMARY tool for code exploration and search.**

### When to Use grepai (REQUIRED)

Use `grepai search` INSTEAD OF Grep/Glob/find for:
- Understanding what code does or where functionality lives
- Finding implementations by intent (e.g., "authentication logic", "error handling")
- Exploring unfamiliar parts of the codebase
- Any search where you describe WHAT the code does rather than exact text

### When to Use Standard Tools

Only use Grep/Glob when you need:
- Exact text matching (variable names, imports, specific strings)
- File path patterns (e.g., `**/*.go`)

### Fallback

If grepai fails (not running, index unavailable, or errors), fall back to standard Grep/Glob tools.

### Usage

```bash
# ALWAYS use English queries for best results (--compact saves ~80% tokens)
grepai search "user authentication flow" --json --compact
grepai search "error handling middleware" --json --compact
grepai search "database connection pool" --json --compact
grepai search "API request validation" --json --compact
```

### Query Tips

- **Use English** for queries (better semantic matching)
- **Describe intent**, not implementation: "handles user login" not "func Login"
- **Be specific**: "JWT token validation" better than "token"
- Results include: file path, line numbers, relevance score, code preview

### Call Graph Tracing

Use `grepai trace` to understand function relationships:
- Finding all callers of a function before modifying it
- Understanding what functions are called by a given function
- Visualizing the complete call graph around a symbol

#### Trace Commands

**IMPORTANT: Always use `--json` flag for optimal AI agent integration.**

```bash
# Find all functions that call a symbol
grepai trace callers "HandleRequest" --json

# Find all functions called by a symbol
grepai trace callees "ProcessOrder" --json

# Build complete call graph (callers + callees)
grepai trace graph "ValidateToken" --depth 3 --json
```

### Workflow

1. Start with `grepai search` to find relevant code
2. Use `grepai trace` to understand function relationships
3. Use `Read` tool to examine files from results
4. Only use Grep for exact string searches if needed

