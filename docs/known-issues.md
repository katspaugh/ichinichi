# Known Issues & Tech Debt

## Remaining Async Bugs

1. **useVault.ts:82-123** — `unlockingRef` not reset on cancel; unlock permanently blocked
2. **useUnifiedMigration.ts:28-67** — `isMigrating` in deps + set in effect; migration stuck

## Fixed by Zustand Migration (March 2026)

The hook orchestration layer was rewritten from XState-based hooks to Zustand stores.
Old XState hook files (`useLocalNoteContent.ts`, `useNoteRemoteSync.ts`, `useSyncMachine.ts`, `useNoteRepositoryMachine.ts`) and their tests have been deleted.

Bugs fixed:
- Save queue capturing stale repo/date → store reads `get()` at execution time
- Remote refresh applying to wrong note → re-reads `get().date` after every `await`
- `flushPendingSave` fire-and-forget → `flushSave()` returns awaitable `Promise<void>`
- Stale closures from multiple useEffects → all state in store via `get()`
- React 18 batching workaround → Zustand updates are synchronous

## Refactoring Needed

- Error handling inconsistent: repos null, gateways Result, hooks try/catch
- Mixed DI: some singletons, some param-passed
- `unifiedSyncedNoteRepository.ts` (668 lines) → split
- No React Error Boundaries → runtime crash kills app
