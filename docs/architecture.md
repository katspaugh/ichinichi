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

## Module Organization

- `src/components`: UI views and view-only components.
- `src/controllers`: controller hooks that shape UI view models.
- `src/domain`: use-cases and factories for core workflows.
- `src/storage`, `src/services`, `src/lib`: data stores, crypto, and backend adapters.
