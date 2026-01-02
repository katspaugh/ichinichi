# Architecture Overview

This document defines the current architecture boundaries and the intended
direction for reducing complexity in DailyNote (E2EE + local-first + optional
sync).

## Goals

- Keep encryption, storage, and sync concerns from leaking into UI.
- Ensure all writes flow through a single pipeline.
- Make sync optional without branching through every feature.
- Keep formats/versioning at boundaries, not in business logic.

## Current Boundaries (Ports + Adapters)

### Ports (interfaces the UI/features should depend on)

- Vault/Crypto (keys, wrap/unwrap, device unlock)
  - Current: `src/services/vaultService.ts`
- Note repository (plaintext in, encrypted at rest)
  - Current: `src/storage/unifiedNoteRepository.ts`
- Image repository (plaintext blobs in, encrypted at rest)
  - Current: `src/storage/unifiedImageRepository.ts`
- Sync scheduler (when to sync, pending ops)
  - Current: `src/services/syncService.ts`

### Adapters (implementation details behind ports)

- IndexedDB storage
  - Current: `src/storage/unifiedNoteStore.ts`, `src/storage/unifiedImageStore.ts`
- Supabase sync + storage
  - Current: `src/storage/unifiedSyncedNoteRepository.ts`,
    `src/storage/unifiedSyncedImageRepository.ts`,
    `src/storage/unifiedSyncService.ts`
- Crypto primitives (encryption, wrapping, key derivation)
  - Current: `src/storage/vault.ts`, `src/storage/unifiedNoteStore.ts`,
    `src/storage/unifiedImageCrypto.ts`

## Canonical Model

- In-memory: plaintext `Note` objects (see `src/types/index.ts`).
- At rest / over the wire: encrypted blobs + minimal metadata (date, revision,
  key id, timestamps).
- Sanitization happens at storage boundaries (save + decrypt), not in UI.

## Write Pipeline (single path)

1) UI/Editor emits plaintext content.
2) Repository encrypts + writes to IndexedDB (note + meta).
3) Pending ops are marked (note meta / image meta).
4) Sync service schedules background sync when allowed.

All UI should call repositories/services; it should not touch crypto or
storage primitives directly.

## Sync States (target model)

Define explicit sync states and move writes through a single pipeline:

- `ANON_LOCAL`: local-only, no account
- `AUTH_NO_SYNC`: signed in, sync disabled
- `AUTH_SYNCING`: syncing in progress
- `AUTH_SYNCED`: up to date
- `ERROR_DEGRADED`: sync paused, local continues

Regardless of state, local writes still happen and mark outbox items. Sync is a
background process controlled by the sync service and state machine.

## Versioning Policy

Only version at the boundaries:

- Encrypted envelopes (note/image payloads)
- Sync protocol payloads
- Event schemas (if/when event log is added)

Avoid scattering version checks throughout feature code.

## Next Steps (incremental)

1) Add a dedicated `NoteService` to own the write pipeline (notes/images).
2) Introduce an outbox API to make pending ops explicit.
3) Formalize sync state machine (hook + reducer).
4) Add invariants and simulation tests for sync durability.
