# Architecture Critique & Improvement Proposals

*Generated: January 2026*

## Architecture Strengths Worth Preserving

1. **Clean encryption boundary** - Storage never sees plaintext; crypto happens at repository hydration layer
2. **Local-first correctness** - IndexedDB is source of truth; sync is async/non-blocking
3. **Result<T, E> pattern** - Domain errors are typed and explicit, no surprise throws
4. **Multi-key support** - Notes survive key rotation without re-encryption
5. **Repository abstraction** - Factory pattern enables seamless local/cloud switching

---

## Key Concerns

### 1. Fragmented State Management (Partially Resolved)

~~The codebase mixes three paradigms without clear rationale.~~

**March 2026 update**: Hook orchestration layer rewritten to Zustand stores (`src/stores/`). Note content, sync, and calendar state now use a single pattern. XState remains only for vault/auth flows.

Remaining: XState for vault (`activeVaultMachine`) — could be migrated to Zustand in future.

### 2. Deep Hook Dependency Chains

```
useAppController
  └→ useActiveVault
       └→ useVault
            └→ useLocalVault
                 └→ useVaultService
```

Five levels deep. Any change in `useVaultService` signature ripples through all layers. This makes refactoring risky and testing awkward (must mock multiple layers).

### 3. Brittle Repository Caching (`useNoteRepository.ts:27-73`)

```typescript
// WeakMap + global counter to track CryptoKey identity
const keyringToken = getKeyringIdentity(activeKeyring)
const cacheKey = `${vaultKeyId}-${keyringToken}-${activeKeyId}-${supabaseSignature}`
```

This relies on object identity and string concatenation. No TTL, no explicit invalidation, no cleanup. If identity tracking fails silently, stale repos persist.

### 4. 400+ Line God Hooks (Mostly Resolved)

**March 2026 update**: `useSync.ts`, `useNoteRepository.ts`, `useNoteContent.ts`, `useNoteDates.ts` are now thin wrappers (~50-100 lines each) over Zustand stores. Logic lives in `src/stores/`. Old XState hook files have been deleted.

Remaining:
- `useActiveVault.ts` (~190 lines) — reduced but could be further split

### 5. Missing Error Boundaries

No React error boundary. A runtime error in any component crashes the entire app. Vault unlock errors navigate through modal cascade with no escape hatch if state gets stuck.

### 6. Inconsistent Async Patterns

Some async operations have cancellation (`localKeyringLoader`), others don't. No consistent timeout handling. Long-running sync could block indefinitely on network issues.

---

## Concrete Improvement Proposals

### 1. ~~Unify State Management on XState~~ → Done via Zustand (March 2026)

Hook orchestration rewritten to Zustand vanilla stores. XState remains for vault/auth only.

**Completed**: `noteContentStore`, `syncStore`, `noteDatesStore` in `src/stores/`.

### 2. Flatten Hook Dependencies with Context Injection

**Current**: Hooks call hooks call hooks (5 levels)
**Proposed**: Services injected via context, hooks consume directly

```typescript
// Before: Chain of hook calls
export function useActiveVault() {
  const vault = useVault()           // calls useLocalVault
  const auth = useAuth()             // calls useSupabase
  // ...
}

// After: Direct context consumption
export function useActiveVault() {
  const vaultService = useContext(VaultServiceContext)
  const auth = useContext(AuthContext)
  // No intermediate hooks
}
```

Create `ServiceProvider` that instantiates services once at app root:

```typescript
// src/contexts/ServiceProvider.tsx
export function ServiceProvider({ children }) {
  const vaultService = useMemo(() => createVaultService(supabase), [supabase])
  const e2eeService = useMemo(() => createE2eeService(), [])

  return (
    <VaultServiceContext.Provider value={vaultService}>
      <E2eeServiceContext.Provider value={e2eeService}>
        {children}
      </E2eeServiceContext.Provider>
    </VaultServiceContext.Provider>
  )
}
```

**Files to change**: Create `src/contexts/ServiceProvider.tsx`, refactor `useActiveVault.ts`, `useNoteRepository.ts`
**Effort**: High (touches many files, but improves testability significantly)

### 3. Replace WeakMap Caching with Explicit Invalidation

**Current**: Object identity tracking with WeakMap
**Proposed**: Version counter in context, repos recreate on version bump

```typescript
// src/contexts/NoteRepositoryContext.tsx
interface RepositoryState {
  version: number
  repository: NoteRepository | null
}

// When keyring changes:
const invalidateRepository = () => setVersion(v => v + 1)

// Repository hook:
const repository = useMemo(() => {
  return createNoteRepository(...)
}, [version, activeKeyId])  // Recreate on version change
```

**Files to change**: `src/hooks/useNoteRepository.ts`, `src/contexts/NoteRepositoryContext.tsx`
**Effort**: Low-Medium

### 4. Split God Hooks into Focused Units (Partially Done)

**March 2026**: `useSync.ts`, `useNoteContent.ts`, `useNoteDates.ts`, `useNoteRepository.ts` are now thin wrappers. Logic in `src/stores/`. Old XState hook files have been deleted.

**Remaining**: `useActiveVault.ts` (~190 lines) — significantly reduced from 486 lines but could still be split into vault machine + unlock flows + keyring management.

**Files to change**: `src/hooks/useActiveVault.ts` → multiple files
**Effort**: Low-Medium

### 5. Add Error Boundary + Recovery

```typescript
// src/components/ErrorBoundary.tsx
export class AppErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  handleReset = () => {
    // Clear corrupted state, reload from IndexedDB
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return <ErrorRecoveryUI onReset={this.handleReset} />
    }
    return this.props.children
  }
}
```

Wrap at multiple levels:
- App root (catch-all)
- NoteEditor (protect editing from calendar errors)
- Sync indicator (isolate sync failures)

**Files to change**: Create `src/components/ErrorBoundary.tsx`, wrap in `App.tsx`
**Effort**: Low

### 6. ~~Standardize Async Operations with AbortController~~ → Done (March 2026)

`src/utils/asyncHelpers.ts` implements `createCancellableOperation` with AbortController and timeout support. Used by `syncStore.ts` for sync operations. Zustand stores also use generation counters and `_disposed` flags for async cancellation.

### 7. Add Integration Test Harness

```typescript
// src/__tests__/integration/syncFlow.test.ts
describe('Full sync flow', () => {
  it('syncs local changes to cloud after unlock', async () => {
    // Setup: Create note locally
    const { repository } = await setupLocalVault()
    await repository.save({ date: '01-01-2024', content: 'test' })

    // Act: Switch to cloud mode, unlock
    await switchToCloudMode(repository)
    await unlockCloudVault('password')

    // Assert: Note synced
    const remote = await fetchRemoteNote('01-01-2024')
    expect(remote.content).toBe('test')
  })
})
```

Focus on:
- Mode switching (local → cloud)
- Offline → online recovery
- Conflict resolution scenarios
- Vault unlock flows (device key, password)

**Files to create**: `src/__tests__/integration/*.test.ts`
**Effort**: High (but high value)

---

## Priority Matrix

| Improvement | Impact | Effort | Priority | Status |
|-------------|--------|--------|----------|--------|
| Error Boundary | High (stability) | Low | **P0** | Open |
| Explicit cache invalidation | High (correctness) | Low-Med | **P1** | Open |
| Standardize async patterns | Medium (reliability) | Medium | **P1** | **Done** (asyncHelpers + Zustand stores) |
| Split god hooks | Medium (maintainability) | Low-Med | **P2** | **Mostly done** (vault ~190 lines remaining) |
| Unify state management | Medium (consistency) | Medium | **P2** | **Done** (Zustand) |
| Flatten hook dependencies | High (testability) | High | **P2** | Open |
| Integration tests | High (confidence) | High | **P3** | Open |

---

## Summary

The architecture is fundamentally sound—local-first, E2EE, clean domain boundaries. The remaining issues are:

1. ~~**Organic complexity** in state management~~ → **Done**: Zustand stores standardized hook orchestration
2. **Tight coupling** via deep hook chains (fix: context-injected services)
3. **Implicit invalidation** in caching (fix: explicit version signals)
4. **No error recovery** (fix: error boundaries)
5. ~~**Inconsistent async patterns**~~ → **Done**: `asyncHelpers.ts` + generation counters + disposed flags

Start with the error boundary (P0), then tackle caching correctness (P1). The larger refactors (P2-P3) can be done incrementally as the codebase evolves.
