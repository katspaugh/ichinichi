# Ichinichi

Telegraph style in all output. See `docs/communication-style.md` for rules + examples.

Minimalist daily notes app. Year-at-a-glance calendar. Local-first, optional cloud sync. Client-side encryption, IndexedDB. Today editable, past read-only, future disabled.

## Core Rules

- One note/day, key: DD-MM-YYYY
- Empty note (no text, no images) → delete
- URL params: ?date=DD-MM-YYYY note, ?year=YYYY calendar
- Escape closes modal; arrows navigate when not editing

## Dev Workflow

1. Write failing test reproducing bug first
2. Fix with minimal changes
3. Verify test passes
4. `npm test` — no regressions
5. `npm run typecheck` — no type errors

## Tech Stack

React 18 + TypeScript, Vite, IndexedDB, Supabase (optional sync), CSS custom properties

## Architecture

- UI: `src/components` — pure views
- Controllers: `src/controllers` — view models, orchestration
- Domain: `src/domain` — use cases (notes, vault, sync)
- Infra: `src/storage`, `src/services`, `src/lib` — crypto, persistence, backend

## Bug Triage Map

| Symptom | Start here |
|---|---|
| Note stuck loading / not rendering | `stores/noteContentStore.ts`, `hooks/useNoteContent.ts` |
| Save not working / data loss | `noteContentStore._doSave`, `_scheduleSave`, `flushSave` |
| Sync issues / pending ops stuck | `stores/syncStore.ts`, `storage/unifiedSyncedNoteRepository.ts` |
| Calendar dots wrong / missing | `stores/noteDatesStore.ts`, `hooks/useNoteDates.ts` |
| Vault/auth broken | `services/vaultService.ts`, `domain/vault/activeVaultMachine.ts` |
| Encryption/decryption errors | `domain/notes/hydratingNoteRepository.ts`, `domain/crypto/` |
| Modal flow issues | `controllers/useAppModalsController.ts`, `hooks/useVaultUiState.ts` |
| Image upload/display broken | `storage/imageRepository.ts`, `components/NoteEditor/useInlineImages.ts` |
| URL/routing broken | `utils/urlState.ts`, `contexts/urlStateContext.ts` |

## Key Patterns

### Async Generation Counters

Zustand stores use generation counters for async cancellation:

```typescript
let _loadGeneration = 0;
const _loadNote = async (date: string, repository: NoteRepository) => {
  const gen = ++_loadGeneration;
  const result = await repository.get(date);
  if (gen !== _loadGeneration) return; // superseded
  set({ content: result.value?.content ?? "" });
};
```

After every `await`, re-read state via `get()` — never close over stale values.
Stores use `_disposed` flag (checked after each `await`) to prevent post-dispose updates.

### Result Type

Functional `Result<T, E>` in domain layer. Inconsistency: repos return null, gateways Result, hooks try/catch.

### DI

Domain defines interfaces → infra implements (`storage/runtimeAdapters.ts`) → React Context provides → factories compose deps.

### State Management

**Zustand stores** (`src/stores/`): noteContentStore, syncStore, noteDatesStore.
Thin React hook wrappers in `src/hooks/` subscribe via `useSyncExternalStore`.
**XState** for vault/auth only (`activeVaultMachine`). See `docs/xstate-rules.md`.

### Patterns to Avoid

- Multiple useEffects on shared state → race conditions; prefer Zustand store
- Refs updated in one effect, read in async callback of another → stale values
- `cancelled` flag without operation cancellation → side effects still run
- Fire-and-forget `void promise.then(...)` → no tracking/cancellation/error handling

## Data Model (src/types/index.ts)

- Note: date, content (sanitized HTML), updatedAt
- SyncedNote: note + revision, serverUpdatedAt?, deleted?
- NoteImage: id, noteDate, type, filename, mimeType, width, height, size, createdAt

## App Modes

- Local (default): unified IndexedDB, no account
- Cloud (opt-in): Supabase auth + encrypted sync, local cache = source of truth

## Storage & Encryption

- DB: `dailynotes-unified` → notes, note_meta, images, image_meta, sync_state
- AES-GCM; metadata separate. Multi-key: `key_id` on notes/images
- Vault meta: localStorage `dailynote_vault_meta_v1`
- Device key: non-exportable CryptoKey in IndexedDB (`dailynotes-vault`)
- Password wrap: PBKDF2 SHA-256, 600k iterations

## Sync (Cloud)

- Debounced on edit; immediate on close + pagehide/beforeunload
- Conflict: revision wins, updatedAt tiebreak
- Pull by `server_updated_at` cursor; push pending ops first

## Editor & Images

- ContentEditable + HTML sanitization save/load
- Inline image: paste/drop, compressed. `data-image-id` attrs, URLs via `ImageUrlManager`

## UI Flows

- Intro modal → first run
- Mode choice → local notes exist
- Vault unlock → device key missing
- Cloud auth → sign-in/sign-up

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

## Reference Docs

- `docs/app-spec.md` — business logic, flows
- `docs/architecture.md` — layer boundaries
- `docs/architecture-critique.md` — improvement proposals
- `docs/data-flow.md` — local/cloud sync
- `docs/key-derivation.md` — KEK/DEK, unlock flow
- `docs/communication-style.md` — telegraph output rules
- `docs/known-issues.md` — bugs, tech debt, fixed issues
- `docs/code-search.md` — ast-grep usage + project rules
- `docs/xstate-rules.md` — XState conventions (vault/auth)
- `docs/agent-workflow.md` — haiku subagent pattern

## Search Workflow (Low Maintenance, High Benefit)

- Use `rg`/`ast-grep` first for fast lookup: "where is X fetched/encrypted/rendered."
- Use Serena after target file is known: `get_symbols_overview` + `find_symbol` for exact bodies/call paths.
- Use Serena for symbol-aware changes: `find_referencing_symbols`, `rename_symbol`, symbol edits.
- Keep Serena onboarding one-time per repo/session; reuse memories.
- Batch Serena queries when possible; avoid many tiny sequential calls.
- Default policy quick locate: `rg`/`ast-grep`.
- Default policy confirm logic/call graph: Serena.
- Default policy multi-file safe symbol refactor: Serena.
