# Architecture Boundaries

## Layers

- UI (components): presentational React components only.
- Controllers (hooks): orchestration and view-model composition for UI.
- Domain (use-cases): business workflows for notes, vault, and sync.
- Infrastructure (storage/services/lib): persistence, encryption, and backend adapters.

## Dependency Direction

- UI depends on controllers and shared types only.
- Controllers depend on domain and shared hooks.
- Domain depends on infrastructure adapters and storage.
- Infrastructure has no dependency on UI/controllers.

## Encryption Boundary

- E2EE lives in a dedicated service (`src/services/e2eeService.ts`).
- Storage repositories persist encrypted envelopes only (ciphertext + metadata).
- Domain repositories hydrate/dehydrate plaintext at the boundary and pass
  envelopes to storage/sync.

## Error Flow

- Infrastructure adapters return typed error results (see `src/domain/result.ts`).
- Domain use-cases propagate `Result<T, E>` instead of throwing.
- Controllers map domain errors to UI-friendly messages.
- UI components render state and avoid interpreting domain errors directly.

## Module Organization

- `src/components`: UI views and view-only components.
- `src/controllers`: controller hooks that shape UI view models.
- `src/domain`: use-cases and factories for core workflows.
- `src/storage`, `src/services`, `src/lib`: data stores, crypto, and backend adapters.
