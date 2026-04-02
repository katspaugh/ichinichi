# Ichinichi

Minimalist daily notes app. Year-at-a-glance calendar. Cloud-only with E2EE. Auth required before any content. Today editable, past read-only, future disabled. Offline signed-in users can read cached entries but not write.

## Core Rules

- One note/day, key: DD-MM-YYYY
- Empty note (no text, no images) → delete
- URL params: ?date=DD-MM-YYYY note, ?year=YYYY calendar
- Escape closes modal; arrows navigate when not editing
- User must sign in before reading or writing
- Offline = read-only from IndexedDB cache
- Sign-out clears all cached data (keeps UI preferences)

## Dev Workflow

1. Write failing test reproducing bug first
2. Fix with minimal changes
3. Verify test passes
4. `npm test` — no regressions
5. `npm run typecheck` — no type errors

## Tech Stack

React 19 + TypeScript, Vite, IndexedDB (cache), Supabase (auth + DB + storage), Web Crypto API (AES-GCM), CSS custom properties

## Architecture

- UI: `src/components` — pure views
- Controllers: `src/controllers` — view models, orchestration
- Domain: `src/domain` — shared types (`errors.ts`, `result.ts`)
- Infra: `src/storage`, `src/services`, `src/lib` — crypto, persistence, backend
- Crypto: `src/crypto.ts` — all encryption, key derivation, keyring management

## Bug Triage Map

| Symptom | Start here |
|---|---|
| Note stuck loading / not rendering | `stores/noteContentStore.ts`, `hooks/useNoteContent.ts` |
| Save not working / data loss | `noteContentStore._doSave`, `storage/noteRepository.ts` |
| Sync issues | `hooks/useSync.ts`, `storage/remoteNotes.ts` |
| Calendar dots wrong / missing | `stores/noteDatesStore.ts`, `hooks/useNoteDates.ts` |
| Auth broken | `hooks/useAuth.ts`, `contexts/AuthProvider.tsx` |
| Encryption/decryption errors | `crypto.ts`, `storage/noteRepository.ts` |
| Image upload/display broken | `storage/imageRepository.ts`, `hooks/useImages.ts` |
| URL/routing broken | `utils/urlState.ts`, `hooks/useUrlState.ts` |

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

Functional `Result<T, E>` in domain layer (`src/domain/result.ts`, `src/domain/errors.ts`).

### Phase-Gated Reducers

Component-scoped state machines using `useReducer` + `useEffect`. Rules:

1. **Discriminated `Phase` union** — explicit states. Every async operation gets its own phase.
2. **Pure exported reducer** — all state transitions synchronous. Export for unit testing.
3. **Phase-gated effects** — each async actor is one `useEffect`. First line: `if (state.phase !== "thePhase") return;`.
4. **Effects only dispatch actions** — never mutate state directly.
5. **Auto-transitions in the reducer** — when state A should immediately proceed to state B, do it in the reducer.
6. **Cancellation in cleanup** — every async effect returns a cleanup that sets `cancelled = true`.

Reference: `hooks/useAuth.ts`.

### Patterns to Avoid

- **Effect-to-effect communication** → route through reducer
- **Dispatching in useEffect to trigger another useEffect** → use auto-transitions
- Multiple useEffects on shared state → race conditions
- Refs updated in one effect, read in async callback of another → stale values
- Fire-and-forget `void promise.then(...)` → no tracking/cancellation/error handling

## Architecture Invariants

Hard rules. Violations MUST be fixed before commit.

### Layer Boundaries

- **Components** → may import from: controllers, contexts, hooks, types, utils. NOT from: storage, stores, domain, lib.
- **Domain** → may import from: types. NOT from: components, controllers, hooks, stores.
- **Stores** → may import from: storage, services, types, utils. NOT from: components, controllers, hooks.
- **Infrastructure** (storage/services/lib) → NOT from: components, controllers, hooks, stores.
- Exception: `NoteEditor` imports editor-specific services. `AppBootstrap` imports `lib/supabase`.

### DO NOT: Use `as` Casts on External Data

All data entering the app from IndexedDB, Supabase, localStorage JSON, or decrypted payloads MUST pass through a parse function in `src/storage/parsers.ts`. Parse functions validate shape and return `T | null`.

### DO NOT: Swallow Errors Silently

Empty `catch {}` blocks hide bugs. Use `reportError()` from `src/utils/errorReporter.ts`.

### DO NOT: Chain useEffects

New component-level async state MUST use the phase-gated reducer pattern. Max 3 useEffect calls per component/hook (lint warning). Max 5 (lint error).

### MUST: Generation Counter Discipline in Stores

After every `await` in a Zustand store method:
1. Check `if (gen !== _generation) return;` — abort if superseded
2. Check `if (get()._disposed) return;` — abort if store disposed
3. Re-read state via `get()` — never close over stale pre-await values

### MUST: Use `reportError()` in New Catch Blocks

Every new `catch` block in stores, storage, or domain code must call `reportError(context, error)`.

## Data Model (src/types/index.ts)

- Note: date, content (sanitized HTML), updatedAt
- NoteImage: id, noteDate, type, filename, mimeType, width, height, size, createdAt
- CachedNoteRecord: date, ciphertext, nonce, keyId, updatedAt, revision, remoteId
- ImageMeta: id, noteDate, type, filename, mimeType, width, height, size, sha256, remotePath

## Storage & Encryption

- Cache DB: `ichinichi-cache` (IndexedDB) — notes, images, image_meta, sync_state
- Supabase is source of truth; IndexedDB is read cache only
- AES-GCM encryption; single DEK per user; key derived from login password via PBKDF2 (600k iterations)
- Single keyring entry in `user_keyrings` table (is_primary = true)
- No local vault, no device key, no multi-key rotation

## Sync

- Pull-only: fetch notes since cursor from Supabase → update cache
- Writes go directly to Supabase (no pending ops queue)
- Triggered on: sign-in, window focus, periodic (30s), realtime event
- Realtime subscription on `notes` table for push notifications

## Editor & Images

- ContentEditable + HTML sanitization save/load
- Inline image: paste/drop, compressed. `data-image-id` attrs, URLs via `ImageUrlManager`
- Images encrypted client-side, stored in Supabase Storage bucket `note-images`

## UI Flows

- Intro modal → auth required (sign-in / sign-up)
- Authenticated + DEK unlocked → app renders
- Offline → read-only mode (visual indicator, save disabled)
- Sign-out → clear all cached data, show intro modal

## Structure

```
src/
  components/    Calendar, NoteEditor, AppModals, SyncIndicator, AuthForm
  controllers/   useAppController
  contexts/      AuthProvider, RoutingProvider, NoteRepositoryProvider, WeatherProvider
  domain/        errors.ts, result.ts
  stores/        Zustand vanilla stores (noteContent, noteDates)
  hooks/         useAuth, useSync, useNoteContent, useNoteDates, useImages, useNoteSearch, useConnectivity, useUrlState, useTheme, usePWA
  crypto.ts      All encryption, key derivation, keyring management
  storage/       cache.ts, remoteNotes.ts, noteRepository.ts, imageRepository.ts, parsers.ts
  services/      connectivity, preferences, exportNotes, editorHotkeys
  utils/         date, sanitization, URL state, error reporting
  styles/        reset/theme/components
  lib/           supabase client
  types/         shared types
```

## Reference Docs

- `docs/app-spec.md` — business logic, flows
- `docs/superpowers/specs/2026-04-02-cloud-only-rewrite-design.md` — rewrite design spec
