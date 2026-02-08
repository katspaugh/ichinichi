# Ichinichi

## Communication Style

Always use telegraph style: no articles, no filler, min tokens. Applies to all agent output — user-facing messages, internal reasoning, subagent prompts. Not for code comments or doc files.

---

Minimalist daily notes app. Year-at-a-glance calendar. Local-first, optional cloud sync. Client-side encryption, IndexedDB storage. Today editable, past read-only, future disabled.

## Core Rules

- One note/day, key: DD-MM-YYYY
- Empty note (no text, no images) → delete
- URL params: ?date=DD-MM-YYYY opens note, ?year=YYYY opens calendar
- Escape closes modal; arrows navigate notes when not editing

## Tech Stack

React 18 + TypeScript, Vite, IndexedDB, Supabase (optional sync), CSS custom properties

## Architecture

- UI: `src/components` — pure views
- Controllers: `src/controllers` — view models, orchestration
- Domain: `src/domain` — use cases (notes, vault, sync)
- Infra: `src/storage`, `src/services`, `src/lib` — crypto, persistence, backend

## App Modes

- Local (default): unified IndexedDB, no account
- Cloud (opt-in): Supabase auth + encrypted sync, local cache = source of truth

## Data Model (src/types/index.ts)

- Note: date, content (sanitized HTML), updatedAt
- SyncedNote: note + revision, serverUpdatedAt?, deleted?
- NoteImage: id, noteDate, type (background|inline), filename, mimeType, width, height, size, createdAt

## Storage & Encryption

- DB: `dailynotes-unified` → stores: notes, note_meta, images, image_meta, sync_state
- AES-GCM encryption; metadata stored separately
- Vault meta: localStorage `dailynote_vault_meta_v1`
- Device key: non-exportable CryptoKey in IndexedDB (`dailynotes-vault`)
- Password wrap: PBKDF2 SHA-256, 600k iterations
- Cloud keyring: Supabase `user_keyrings`
- Cloud DEK cache: localStorage `dailynote_cloud_dek_cache_v1`
- Multi-key: notes/images carry `key_id`, no re-encrypt on mode change

## Sync (Cloud)

- Debounced on edit; immediate on note close + pagehide/beforeunload
- Status: idle | syncing | synced | offline | error
- Conflict: revision wins, updatedAt tiebreak
- Pull by `server_updated_at` cursor; push local pending ops first

## Editor & Images

- ContentEditable + HTML sanitization on save/load
- Inline image: paste/drop, compressed before upload
- `data-image-id` attrs, URLs via `ImageUrlManager`
- Saving indicator after idle; decrypting state until ready

## UI Flows

- Intro modal → first run
- Mode choice → once local notes exist
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
