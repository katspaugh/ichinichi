# Effect Adoption Plan: Note Persistence

## Problem Statement

The current architecture has systemic bugs stemming from:

1. **Race conditions** — Multiple `useEffect` hooks operating on shared state without coordination
2. **State inconsistency** — Refs updated in separate effects, read in async callbacks with stale values
3. **Cancellation issues** — `cancelled` flag pattern doesn't stop side effects, only prevents state updates
4. **Debugging difficulty** — Hard to trace async operation interleaving

### Specific High-Severity Issues

| File                     | Lines   | Issue                                                                                                   |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------- |
| `useVault.ts`            | 82-123  | `unlockingRef` not reset on cancellation → unlock permanently blocked                                   |
| `useUnifiedMigration.ts` | 28-67   | `isMigrating` in deps + set inside effect → migration stuck forever                                     |
| `useLocalNoteContent.ts` | 190-232 | Save queue captures stale repository/date → saves to wrong note                                         |
| `useNoteRemoteSync.ts`   | 153-187 | Refresh callback uses refs for _current_ date, not refresh target → remote update applied to wrong note |

## Solution: Adopt Effect

Effect provides:

- **True cancellation** via Fiber interruption (propagates to child operations)
- **Typed errors** through the entire call chain
- **Sequential guarantees** via Semaphore/Queue primitives
- **Context scoping** — operations tied to specific date/repository at construction time

## Strategy

- **Parallel implementation**: Build Effect-based services alongside existing code
- **Effect → Promise wrappers**: New Effect code exports Promise wrappers for non-migrated consumers
- **Test alongside**: Write Effect-specific tests as each service is built
- **Incremental swap**: Replace hooks one at a time once Effect layer is complete

## Architecture

### Current

```
┌─────────────────────────────────────────────────────────────────┐
│  React Hooks (useLocalNoteContent, useNoteRemoteSync, useSync)  │
│  - Multiple useEffects with cancelled flags                     │
│  - Refs to track state across effects                           │
│  - Promise chaining for save queue                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Promise<T | null>
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Repository (NoteRepository, UnifiedSyncedNoteEnvelopeRepository)│
│  - Mixed null/throw/Result patterns                             │
│  - No cancellation support                                      │
└─────────────────────────────────────────────────────────────────┘
```

### With Effect

```
┌─────────────────────────────────────────────────────────────────┐
│  React Hooks (useNoteSession)                                   │
│  - Single useEffect runs Effect program                         │
│  - Fiber.interrupt on cleanup                                   │
│  - No refs needed                                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Effect<T, E, R>
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Effect Services                                                │
│  - NoteRepository service (Effect-based)                        │
│  - SaveQueue (Effect.Semaphore for serialization)               │
│  - SyncCoordinator (debounced, interruptible)                   │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
src/
├── effect/                          # New Effect-based layer
│   ├── runtime.ts                   # Runtime + Layer setup
│   ├── errors.ts                    # Tagged error types
│   ├── services/
│   │   ├── NoteRepository.ts        # Effect service wrapping existing repo
│   │   ├── SaveQueue.ts             # Serialized save operations
│   │   ├── SyncCoordinator.ts       # Debounced sync with interruption
│   │   └── Clock.ts                 # Effect service for Clock
│   ├── programs/
│   │   ├── noteSession.ts           # Load → Edit → Save → Sync lifecycle
│   │   └── sync.ts                  # Full sync operation
│   └── hooks/
│       ├── useEffectRuntime.ts      # React integration utilities
│       └── useNoteSession.ts        # React hook consuming Effect
```

---

## Phase 1: Foundation

### 1.1 Add Effect dependency

```bash
npm install effect
```

### 1.2 Create `src/effect/errors.ts`

Map existing domain errors to Effect-compatible tagged errors:

```typescript
import { Data } from "effect";

export class NoteNotFound extends Data.TaggedError("NoteNotFound")<{
  date: string;
}> {}

export class DecryptionFailed extends Data.TaggedError("DecryptionFailed")<{
  date: string;
  cause?: unknown;
}> {}

export class StorageFailed extends Data.TaggedError("StorageFailed")<{
  operation: "read" | "write" | "delete";
  cause?: unknown;
}> {}

export class SyncFailed extends Data.TaggedError("SyncFailed")<{
  type: "Offline" | "Conflict" | "RemoteRejected" | "Unknown";
  message: string;
}> {}
```

### 1.3 Create `src/effect/runtime.ts`

```typescript
import { Layer, ManagedRuntime } from "effect";

// Populated with services in later phases
export const AppLayer = Layer.empty;

export const AppRuntime = ManagedRuntime.make(AppLayer);
```

### 1.4 Create `src/effect/hooks/useEffectRuntime.ts`

Hook for running Effects with proper cleanup:

```typescript
import { useEffect, useState, useRef } from "react";
import { Effect, Fiber, Exit } from "effect";

interface UseEffectResult<A, E> {
  data: A | null;
  error: E | null;
  isLoading: boolean;
}

export function useEffectRunner<A, E>(
  effectFn: () => Effect.Effect<A, E>,
  deps: unknown[],
): UseEffectResult<A, E> {
  const [state, setState] = useState<UseEffectResult<A, E>>({
    data: null,
    error: null,
    isLoading: true,
  });
  const fiberRef = useRef<Fiber.RuntimeFiber<A, E> | null>(null);

  useEffect(() => {
    setState({ data: null, error: null, isLoading: true });

    const fiber = Effect.runFork(effectFn());
    fiberRef.current = fiber;

    fiber.addObserver((exit) => {
      if (Exit.isSuccess(exit)) {
        setState({ data: exit.value, error: null, isLoading: false });
      } else if (Exit.isFailure(exit)) {
        // Handle failure (not interruption)
        const cause = exit.cause;
        if (cause._tag === "Fail") {
          setState({ data: null, error: cause.error, isLoading: false });
        }
      }
    });

    return () => {
      if (fiberRef.current) {
        Effect.runFork(Fiber.interrupt(fiberRef.current));
        fiberRef.current = null;
      }
    };
  }, deps);

  return state;
}
```

---

## Phase 2: NoteRepository Service

### 2.1 Create `src/effect/services/NoteRepository.ts`

```typescript
import { Context, Effect, Layer } from "effect";
import type { Note } from "../../types";
import type { NoteRepository as IRepo } from "../../storage/noteRepository";
import { NoteNotFound, StorageFailed, DecryptionFailed } from "../errors";

export class NoteRepositoryService extends Context.Tag("NoteRepository")<
  NoteRepositoryService,
  {
    get: (date: string) => Effect.Effect<Note, NoteNotFound | DecryptionFailed>;
    save: (date: string, content: string) => Effect.Effect<void, StorageFailed>;
    delete: (date: string) => Effect.Effect<void, StorageFailed>;
    getAllDates: () => Effect.Effect<string[], StorageFailed>;
  }
>() {}

export const makeNoteRepositoryLayer = (repo: IRepo) =>
  Layer.succeed(NoteRepositoryService, {
    get: (date) =>
      Effect.tryPromise({
        try: () => repo.get(date),
        catch: (e) => new DecryptionFailed({ date, cause: e }),
      }).pipe(
        Effect.flatMap((note) =>
          note ? Effect.succeed(note) : Effect.fail(new NoteNotFound({ date })),
        ),
      ),

    save: (date, content) =>
      Effect.tryPromise({
        try: () => repo.save(date, content),
        catch: (e) => new StorageFailed({ operation: "write", cause: e }),
      }),

    delete: (date) =>
      Effect.tryPromise({
        try: () => repo.delete(date),
        catch: (e) => new StorageFailed({ operation: "delete", cause: e }),
      }),

    getAllDates: () =>
      Effect.tryPromise({
        try: () => repo.getAllDates(),
        catch: (e) => new StorageFailed({ operation: "read", cause: e }),
      }),
  });
```

### 2.2 Test file: `src/effect/services/__tests__/NoteRepository.test.ts`

Test the Effect service wrapper against mock repositories, verifying:

- Successful operations return correctly typed values
- Errors are mapped to appropriate tagged errors
- Interruption is handled gracefully

---

## Phase 3: SaveQueue Service

### 3.1 Create `src/effect/services/SaveQueue.ts`

```typescript
import { Context, Effect, Layer, Queue, Ref, Fiber } from "effect";
import { NoteRepositoryService } from "./NoteRepository";
import { isContentEmpty } from "../../utils/sanitize";

interface SaveRequest {
  readonly date: string;
  readonly content: string;
}

export class SaveQueueService extends Context.Tag("SaveQueue")<
  SaveQueueService,
  {
    enqueue: (req: SaveRequest) => Effect.Effect<void>;
    flush: () => Effect.Effect<void>;
  }
>() {}

export const SaveQueueLive = Layer.scoped(
  SaveQueueService,
  Effect.gen(function* () {
    const repo = yield* NoteRepositoryService;
    const queue = yield* Queue.unbounded<SaveRequest>();
    const processingFiber = yield* Ref.make<Fiber.Fiber<void> | null>(null);

    const processSave = (req: SaveRequest) =>
      Effect.gen(function* () {
        // Interruption checkpoint
        yield* Effect.yieldNow();

        const isEmpty = isContentEmpty(req.content);
        if (isEmpty) {
          yield* repo.delete(req.date);
        } else {
          yield* repo.save(req.date, req.content);
        }
      }).pipe(
        Effect.catchAll((error) =>
          Effect.logError("Failed to save note", error),
        ),
      );

    const processQueue = Effect.gen(function* () {
      while (true) {
        const req = yield* Queue.take(queue);
        yield* processSave(req);
      }
    });

    // Start background processor
    const fiber = yield* Effect.fork(processQueue);
    yield* Ref.set(processingFiber, fiber);

    // Cleanup on scope close
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        // Drain remaining items before shutdown
        const remaining = yield* Queue.takeAll(queue);
        for (const req of remaining) {
          yield* processSave(req);
        }
        yield* Fiber.interrupt(fiber);
      }),
    );

    return {
      enqueue: (req) => Queue.offer(queue, req).pipe(Effect.asVoid),
      flush: () =>
        Effect.gen(function* () {
          // Wait for queue to drain
          yield* Effect.repeatUntil(
            Queue.size(queue).pipe(Effect.map((s) => s === 0)),
            Boolean,
          );
        }),
    };
  }),
);
```

**Key fix**: The current `pendingSaveRef` chain captures stale repository. Effect captures `repo` at Layer construction time — it's immutable for the lifetime of the session.

---

## Phase 4: Note Session Program

### 4.1 Create `src/effect/programs/noteSession.ts`

This replaces the coordination between `useLocalNoteContent` and `useNoteRemoteSync`:

```typescript
import { Effect, Ref, Fiber, Schedule } from "effect";
import { NoteRepositoryService } from "../services/NoteRepository";
import { SaveQueueService } from "../services/SaveQueue";
import { NoteNotFound } from "../errors";

export type NoteSessionStatus = "loading" | "ready" | "error";

export interface NoteSessionState {
  readonly content: string;
  readonly hasEdits: boolean;
  readonly status: NoteSessionStatus;
  readonly error: Error | null;
}

const initialState: NoteSessionState = {
  content: "",
  hasEdits: false,
  status: "loading",
  error: null,
};

export interface NoteSession {
  readonly getState: Effect.Effect<NoteSessionState>;
  readonly setContent: (content: string) => Effect.Effect<void>;
  readonly applyRemoteUpdate: (content: string) => Effect.Effect<void>;
}

export const createNoteSession = (date: string) =>
  Effect.gen(function* () {
    const repo = yield* NoteRepositoryService;
    const saveQueue = yield* SaveQueueService;

    const state = yield* Ref.make<NoteSessionState>(initialState);
    const debouncedSaveFiber = yield* Ref.make<Fiber.Fiber<void> | null>(null);

    // Load initial content
    const loadResult = yield* repo.get(date).pipe(
      Effect.map((note) => note.content),
      Effect.catchTag("NoteNotFound", () => Effect.succeed("")),
      Effect.either,
    );

    if (loadResult._tag === "Right") {
      yield* Ref.set(state, {
        content: loadResult.right,
        hasEdits: false,
        status: "ready",
        error: null,
      });
    } else {
      yield* Ref.set(state, {
        content: "",
        hasEdits: false,
        status: "error",
        error: new Error("Failed to load note"),
      });
    }

    const scheduleSave = (content: string) =>
      Effect.gen(function* () {
        // Cancel previous debounced save
        const existing = yield* Ref.get(debouncedSaveFiber);
        if (existing) {
          yield* Fiber.interrupt(existing);
        }

        // Schedule new save with debounce
        const fiber = yield* saveQueue
          .enqueue({ date, content })
          .pipe(Effect.delay("400 millis"), Effect.fork);

        yield* Ref.set(debouncedSaveFiber, fiber);
      });

    return {
      getState: Ref.get(state),

      setContent: (content: string) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          if (current.status !== "ready" && current.status !== "error") {
            return;
          }
          if (content === current.content) {
            return;
          }

          yield* Ref.set(state, {
            ...current,
            content,
            hasEdits: true,
            status: "ready",
            error: null,
          });

          yield* scheduleSave(content);
        }),

      applyRemoteUpdate: (content: string) =>
        Ref.update(state, (s) =>
          s.hasEdits ? s : { ...s, content, hasEdits: false },
        ),
    } satisfies NoteSession;
  });
```

### 4.2 Create `src/effect/hooks/useNoteSession.ts`

```typescript
import { useEffect, useState, useRef, useCallback } from "react";
import { Effect, Fiber, Layer, Exit, Runtime } from "effect";
import type { NoteRepository } from "../../storage/noteRepository";
import {
  createNoteSession,
  type NoteSession,
  type NoteSessionState,
} from "../programs/noteSession";
import { makeNoteRepositoryLayer } from "../services/NoteRepository";
import { SaveQueueLive } from "../services/SaveQueue";

const initialState: NoteSessionState = {
  content: "",
  hasEdits: false,
  status: "loading",
  error: null,
};

export interface UseNoteSessionReturn {
  content: string;
  setContent: (content: string) => void;
  isLoading: boolean;
  hasEdits: boolean;
  isReady: boolean;
  error: Error | null;
  applyRemoteUpdate: (content: string) => void;
}

export function useNoteSession(
  date: string | null,
  repository: NoteRepository | null,
): UseNoteSessionReturn {
  const [state, setState] = useState<NoteSessionState>(initialState);
  const sessionRef = useRef<NoteSession | null>(null);
  const fiberRef = useRef<Fiber.RuntimeFiber<NoteSession, unknown> | null>(
    null,
  );

  useEffect(() => {
    if (!date || !repository) {
      setState(initialState);
      return;
    }

    // Build layer for this specific repository
    const layer = Layer.provideMerge(
      makeNoteRepositoryLayer(repository),
      SaveQueueLive,
    );

    // Create and run session
    const program = createNoteSession(date).pipe(Effect.provide(layer));

    const fiber = Effect.runFork(program);
    fiberRef.current = fiber;

    // Observe session creation
    fiber.addObserver((exit) => {
      if (Exit.isSuccess(exit)) {
        const session = exit.value;
        sessionRef.current = session;

        // Poll state (in real impl, use Effect.Stream or subscriptions)
        const pollState = async () => {
          if (!sessionRef.current) return;
          const currentState = await Effect.runPromise(session.getState);
          setState(currentState);
        };
        pollState();
      }
    });

    return () => {
      sessionRef.current = null;
      if (fiberRef.current) {
        // Interrupt fiber - this will:
        // 1. Cancel any in-flight load
        // 2. Trigger SaveQueue finalizer (flushes pending saves)
        // 3. Cancel debounced saves
        Effect.runFork(Fiber.interrupt(fiberRef.current));
        fiberRef.current = null;
      }
    };
  }, [date, repository]);

  const setContent = useCallback((content: string) => {
    if (!sessionRef.current) return;
    Effect.runFork(sessionRef.current.setContent(content));
    // Optimistically update local state
    setState((s) => ({ ...s, content, hasEdits: true }));
  }, []);

  const applyRemoteUpdate = useCallback((content: string) => {
    if (!sessionRef.current) return;
    Effect.runFork(sessionRef.current.applyRemoteUpdate(content));
  }, []);

  return {
    content: state.content,
    setContent,
    isLoading: state.status === "loading",
    hasEdits: state.hasEdits,
    isReady: state.status === "ready" || state.status === "error",
    error: state.error,
    applyRemoteUpdate,
  };
}
```

---

## Phase 5: Sync Coordinator

### 5.1 Create `src/effect/services/SyncCoordinator.ts`

Replaces `syncService.ts` with proper interruption and debouncing:

```typescript
import { Context, Effect, Layer, Ref, Fiber, Schedule } from "effect";
import type { SyncStatus } from "../../types";
import type { SyncError } from "../../domain/errors";

export class SyncCoordinatorService extends Context.Tag("SyncCoordinator")<
  SyncCoordinatorService,
  {
    requestSync: (immediate?: boolean) => Effect.Effect<void>;
    dispose: () => Effect.Effect<void>;
    getStatus: () => Effect.Effect<SyncStatus>;
    onStatusChange: (
      cb: (status: SyncStatus) => void,
    ) => Effect.Effect<() => void>;
  }
>() {}

interface SyncRepository {
  sync: () => Promise<
    { ok: true; value: SyncStatus } | { ok: false; error: SyncError }
  >;
}

export const makeSyncCoordinatorLayer = (repo: SyncRepository) =>
  Layer.scoped(
    SyncCoordinatorService,
    Effect.gen(function* () {
      const status = yield* Ref.make<SyncStatus>("idle");
      const syncFiber = yield* Ref.make<Fiber.Fiber<void> | null>(null);
      const listeners = new Set<(status: SyncStatus) => void>();

      const setStatus = (newStatus: SyncStatus) =>
        Effect.gen(function* () {
          yield* Ref.set(status, newStatus);
          listeners.forEach((cb) => cb(newStatus));
        });

      const runSync = Effect.gen(function* () {
        // Interruption checkpoint before network call
        yield* Effect.yieldNow();

        yield* setStatus("syncing");

        const result = yield* Effect.tryPromise({
          try: () => repo.sync(),
          catch: () => ({
            ok: false as const,
            error: { type: "Unknown" as const, message: "Sync failed" },
          }),
        });

        if (result.ok) {
          yield* setStatus(result.value);
        } else {
          yield* setStatus("error");
        }
      });

      const requestSync = (immediate = false) =>
        Effect.gen(function* () {
          // Cancel existing sync
          const existing = yield* Ref.get(syncFiber);
          if (existing) {
            yield* Fiber.interrupt(existing);
          }

          // Start new sync
          const fiber = yield* runSync.pipe(
            immediate ? Effect.identity : Effect.delay("2 seconds"),
            Effect.fork,
          );
          yield* Ref.set(syncFiber, fiber);
        });

      // Cleanup on scope close
      yield* Effect.addFinalizer(() =>
        Ref.get(syncFiber).pipe(
          Effect.flatMap((f) => (f ? Fiber.interrupt(f) : Effect.void)),
        ),
      );

      return {
        requestSync,
        dispose: () =>
          Ref.get(syncFiber).pipe(
            Effect.flatMap((f) => (f ? Fiber.interrupt(f) : Effect.void)),
          ),
        getStatus: () => Ref.get(status),
        onStatusChange: (cb) =>
          Effect.sync(() => {
            listeners.add(cb);
            return () => listeners.delete(cb);
          }),
      };
    }),
  );
```

---

## Migration Checklist

| Step | File                                                    | Action                                            | Status |
| ---- | ------------------------------------------------------- | ------------------------------------------------- | ------ |
| 1.1  | `package.json`                                          | Add `effect` dependency                           | ⬜     |
| 1.2  | `src/effect/errors.ts`                                  | Define tagged errors                              | ⬜     |
| 1.3  | `src/effect/runtime.ts`                                 | Create runtime                                    | ⬜     |
| 1.4  | `src/effect/hooks/useEffectRuntime.ts`                  | React integration hook                            | ⬜     |
| 2.1  | `src/effect/services/NoteRepository.ts`                 | Wrap existing repo                                | ⬜     |
| 2.2  | `src/effect/services/__tests__/NoteRepository.test.ts`  | Tests                                             | ⬜     |
| 3.1  | `src/effect/services/SaveQueue.ts`                      | Serialized saves                                  | ⬜     |
| 3.2  | `src/effect/services/__tests__/SaveQueue.test.ts`       | Tests                                             | ⬜     |
| 4.1  | `src/effect/programs/noteSession.ts`                    | Unified note lifecycle                            | ⬜     |
| 4.2  | `src/effect/hooks/useNoteSession.ts`                    | React hook                                        | ⬜     |
| 4.3  | `src/effect/programs/__tests__/noteSession.test.ts`     | Tests                                             | ⬜     |
| 5.1  | `src/effect/services/SyncCoordinator.ts`                | Interruptible sync                                | ⬜     |
| 5.2  | `src/effect/services/__tests__/SyncCoordinator.test.ts` | Tests                                             | ⬜     |
| 6.1  | `src/hooks/useNoteContent.ts`                           | New hook using Effect                             | ⬜     |
| 6.2  | `src/components/NoteEditor/index.tsx`                   | Swap to new hook                                  | ⬜     |
| 6.3  | —                                                       | Delete `useLocalNoteContent`, `useNoteRemoteSync` | ⬜     |

---

## Key Fixes Summary

| Current Bug                              | Effect Fix                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Save queue captures stale repository     | Layer captures repository at construction; immutable for session lifetime |
| `cancelled` flag doesn't stop operations | `Fiber.interrupt` propagates to all child effects                         |
| Refs updated in separate effects         | State in `Ref` tied to single fiber; no cross-effect coordination needed  |
| Multiple effects racing                  | Single Effect program per note session                                    |
| `unlockingRef` not reset on cancellation | `Effect.addFinalizer` guarantees cleanup runs                             |
| Fire-and-forget async without tracking   | All operations are fibers; can be awaited or interrupted                  |

---

## Future Phases (Out of Scope)

After note persistence is stable:

1. **Vault/Auth** — Apply same pattern to `useVault`, `useActiveVault`
2. **Image handling** — `ImageUrlManager` with proper cleanup
3. **Full Layer composition** — Unified app runtime with all services
