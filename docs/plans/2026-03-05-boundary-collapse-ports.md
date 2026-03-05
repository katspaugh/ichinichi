# Boundary Collapse Fix: Domain Port Extraction

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate direct storage imports from domain layer by extracting port interfaces for note envelope persistence and remote date index.

**Architecture:** Define `NoteEnvelopePort` and `RemoteDateIndexPort` interfaces in domain. Move `NoteRecord`/`NoteMetaRecord` types to domain (they're encrypted envelope shapes the domain owns). Storage layer implements ports via IndexedDB. Factories wire concrete adapters. Zero behavior change.

**Tech Stack:** TypeScript interfaces, dependency injection via constructor args.

---

### Task 1: Move NoteRecord and NoteMetaRecord types to domain

**Files:**
- Create: `src/domain/notes/noteRecord.ts`
- Modify: `src/storage/unifiedDb.ts:13-30` (re-export from domain)

**Step 1: Create the domain type file**

```typescript
// src/domain/notes/noteRecord.ts
export interface NoteRecord {
  version: 1;
  date: string;
  keyId: string;
  ciphertext: string;
  nonce: string;
  updatedAt: string;
}

export interface NoteMetaRecord {
  date: string;
  revision: number;
  serverRevision?: number;
  remoteId?: string | null;
  serverUpdatedAt?: string | null;
  lastSyncedAt?: string | null;
  pendingOp?: "upsert" | "delete" | null;
}
```

**Step 2: Update storage/unifiedDb.ts to re-export**

Replace the `NoteRecord` and `NoteMetaRecord` interface declarations (lines 13-30) with:

```typescript
export type { NoteRecord, NoteMetaRecord } from "../domain/notes/noteRecord";
```

This preserves all existing storage imports without changes.

**Step 3: Update domain imports to use new path**

In these files, change `import type { NoteMetaRecord, NoteRecord } from "../../storage/unifiedDb"` to `import type { NoteMetaRecord, NoteRecord } from "./noteRecord"` (or appropriate relative path):

- `src/domain/notes/localNoteRepository.ts:7`
- `src/domain/notes/syncedNoteRepository.ts:10`
- `src/domain/sync/noteSyncEngine.ts:10`

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (zero behavior change, just moved types)

**Step 5: Commit**

```
Move NoteRecord/NoteMetaRecord types from storage to domain

Encrypted envelope shapes are owned by domain (crypto layer produces them).
Storage re-exports for backward compat.
```

---

### Task 2: Define NoteEnvelopePort interface

**Files:**
- Create: `src/domain/notes/noteEnvelopePort.ts`

**Step 1: Create the port interface**

```typescript
// src/domain/notes/noteEnvelopePort.ts
import type { NoteRecord, NoteMetaRecord } from "./noteRecord";
import type { NoteEnvelope } from "../../types";

export interface NoteEnvelopeState {
  envelope: NoteEnvelope | null;
  record: NoteRecord | null;
  meta: NoteMetaRecord | null;
}

export interface NoteEnvelopePort {
  getState(date: string): Promise<NoteEnvelopeState>;
  getAllStates(): Promise<NoteEnvelopeState[]>;
  setNoteAndMeta(record: NoteRecord, meta: NoteMetaRecord): Promise<void>;
  setMeta(meta: NoteMetaRecord): Promise<void>;
  deleteNoteAndMeta(date: string): Promise<void>;
  deleteRecord(date: string): Promise<void>;
  toEnvelope(record: NoteRecord, meta: NoteMetaRecord | null): NoteEnvelope;
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (new file, no consumers yet)

**Step 3: Commit**

```
Add NoteEnvelopePort interface in domain layer
```

---

### Task 3: Define RemoteDateIndexPort interface

**Files:**
- Create: `src/domain/notes/remoteDateIndexPort.ts`

**Step 1: Create the port interface**

```typescript
// src/domain/notes/remoteDateIndexPort.ts
export interface RemoteDateIndexPort {
  getDatesForYear(year: number): Promise<string[]>;
  setDatesForYear(year: number, dates: string[]): Promise<void>;
  hasDate(date: string): Promise<boolean>;
  deleteDate(date: string): Promise<void>;
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```
Add RemoteDateIndexPort interface in domain layer
```

---

### Task 4: Implement storage adapters for both ports

**Files:**
- Create: `src/storage/noteEnvelopeAdapter.ts`
- Create: `src/storage/remoteDateIndexAdapter.ts`

**Step 1: Create NoteEnvelopeAdapter**

```typescript
// src/storage/noteEnvelopeAdapter.ts
import type { NoteEnvelopePort, NoteEnvelopeState } from "../domain/notes/noteEnvelopePort";
import type { NoteRecord, NoteMetaRecord } from "../domain/notes/noteRecord";
import type { NoteEnvelope } from "../types";
import {
  getNoteEnvelopeState,
  getAllNoteEnvelopeStates,
  toNoteEnvelope,
} from "./unifiedNoteEnvelopeRepository";
import {
  setNoteAndMeta,
  setNoteMeta,
  deleteNoteAndMeta,
  deleteNoteRecord,
} from "./unifiedNoteStore";

export function createNoteEnvelopeAdapter(): NoteEnvelopePort {
  return {
    getState: getNoteEnvelopeState,
    getAllStates: getAllNoteEnvelopeStates,
    setNoteAndMeta,
    setMeta: setNoteMeta,
    deleteNoteAndMeta,
    deleteRecord: deleteNoteRecord,
    toEnvelope: toNoteEnvelope,
  };
}
```

**Step 2: Create RemoteDateIndexAdapter**

```typescript
// src/storage/remoteDateIndexAdapter.ts
import type { RemoteDateIndexPort } from "../domain/notes/remoteDateIndexPort";
import {
  getRemoteDatesForYear,
  setRemoteDatesForYear,
  hasRemoteDate,
  deleteRemoteDate,
} from "./remoteNoteIndexStore";

export function createRemoteDateIndexAdapter(): RemoteDateIndexPort {
  return {
    getDatesForYear: getRemoteDatesForYear,
    setDatesForYear: setRemoteDatesForYear,
    hasDate: hasRemoteDate,
    deleteDate: deleteRemoteDate,
  };
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```
Add storage adapters implementing domain ports
```

---

### Task 5: Inject NoteEnvelopePort into localNoteRepository

**Files:**
- Modify: `src/domain/notes/localNoteRepository.ts`

**Step 1: Update createLocalNoteRepository signature and body**

Add `envelopePort: NoteEnvelopePort` parameter. Replace all direct storage imports with port calls:

- `getNoteEnvelopeState(date)` → `envelopePort.getState(date)`
- `getAllNoteEnvelopeStates()` → `envelopePort.getAllStates()`
- `setNoteAndMeta(record, meta)` → `envelopePort.setNoteAndMeta(record, meta)`
- `deleteNoteAndMeta(date)` → `envelopePort.deleteNoteAndMeta(date)`

Remove these imports:
- `from "../../storage/unifiedNoteEnvelopeRepository"`
- `from "../../storage/unifiedNoteStore"`

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: FAIL — callers don't pass the port yet. That's expected.

---

### Task 6: Inject NoteEnvelopePort + RemoteDateIndexPort into syncedNoteRepository

**Files:**
- Modify: `src/domain/notes/syncedNoteRepository.ts`

**Step 1: Update createSyncedNoteRepository signature and body**

Add `envelopePort: NoteEnvelopePort` parameter. Replace:

- `getNoteEnvelopeState(date)` → `envelopePort.getState(date)`
- `setNoteAndMeta(record, meta)` → `envelopePort.setNoteAndMeta(record, meta)`
- `setNoteMeta(meta)` → `envelopePort.setMeta(meta)`
- `deleteNoteRecord(date)` → `envelopePort.deleteRecord(date)`
- `deleteRemoteDate(date)` → `remoteDateIndex.deleteDate(date)`

Add `remoteDateIndex: RemoteDateIndexPort` parameter (only used for `deleteRemoteDate`).

Remove these imports:
- `from "../../storage/unifiedNoteEnvelopeRepository"`
- `from "../../storage/unifiedNoteStore"`
- `from "../../storage/remoteNoteIndexStore"`

---

### Task 7: Inject both ports into noteSyncEngine

**Files:**
- Modify: `src/domain/sync/noteSyncEngine.ts`

**Step 1: Update createNoteSyncEngine signature**

Add `envelopePort: NoteEnvelopePort` and `remoteDateIndex: RemoteDateIndexPort` parameters.

Replace all direct storage calls:

- `getNoteEnvelopeState(date)` → `envelopePort.getState(date)`
- `getAllNoteEnvelopeStates()` → `envelopePort.getAllStates()`
- `toNoteEnvelope(record, meta)` → `envelopePort.toEnvelope(record, meta)`
- `setNoteAndMeta(record, meta)` → `envelopePort.setNoteAndMeta(record, meta)`
- `setNoteMeta(meta)` → `envelopePort.setMeta(meta)`
- `deleteNoteAndMeta(date)` → `envelopePort.deleteNoteAndMeta(date)`
- `deleteRemoteDate(date)` → `remoteDateIndex.deleteDate(date)`
- `getRemoteDatesForYear(year)` → `remoteDateIndex.getDatesForYear(year)`
- `hasRemoteDate(date)` → `remoteDateIndex.hasDate(date)`
- `setRemoteDatesForYear(year, dates)` → `remoteDateIndex.setDatesForYear(year, dates)`

Remove these imports:
- `from "../../storage/unifiedDb"`
- `from "../../storage/unifiedNoteStore"`
- `from "../../storage/remoteNoteIndexStore"`
- `from "../../storage/unifiedNoteEnvelopeRepository"`

---

### Task 8: Wire adapters in repositoryFactory and useNoteRepository

**Files:**
- Modify: `src/domain/notes/repositoryFactory.ts`
- Modify: `src/hooks/useNoteRepository.ts`

**Step 1: Update repositoryFactory.ts**

Import `NoteEnvelopePort` and `RemoteDateIndexPort`. Add them to function parameters:

```typescript
interface NoteRepositoryOptions {
  mode: AppMode;
  userId: string | null;
  keyProvider: KeyringProvider;
  syncedFactories?: SyncedRepositoryFactories;
  envelopePort: NoteEnvelopePort;    // NEW
}
```

Pass `envelopePort` to `createLocalNoteRepository(crypto, envelopePort)`.

Update `SyncedRepositoryFactories.createSyncedNoteRepository` signature to accept ports.

**Step 2: Update useNoteRepository.ts**

Import and instantiate adapters:

```typescript
import { createNoteEnvelopeAdapter } from "../storage/noteEnvelopeAdapter";
import { createRemoteDateIndexAdapter } from "../storage/remoteDateIndexAdapter";
```

Create adapters in `useMemo` (stable, no deps — they're stateless wrappers):

```typescript
const envelopePort = useMemo(() => createNoteEnvelopeAdapter(), []);
const remoteDateIndex = useMemo(() => createRemoteDateIndexAdapter(), []);
```

Pass to factory calls and `createNoteSyncEngine`.

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```
Wire port adapters through factory and hooks

Domain layer no longer imports from storage/ directly.
```

---

### Task 9: Update tests

**Files:**
- Modify: `src/__tests__/unifiedSyncedNoteRepository.test.ts`
- Modify: `src/__tests__/unifiedStorage.test.ts`

**Step 1: Update test factories to pass ports**

Tests that call `createNoteSyncEngine`, `createLocalNoteRepository`, or `createSyncedNoteRepository` need to pass the port arguments. For the existing integration tests, use the real adapters:

```typescript
import { createNoteEnvelopeAdapter } from "../storage/noteEnvelopeAdapter";
import { createRemoteDateIndexAdapter } from "../storage/remoteDateIndexAdapter";
```

For the sync engine test, create ports at test setup and pass them through.

**Step 2: Run full test suite**

Run: `npm test -- --runInBand`
Expected: 630 tests PASS

**Step 3: Commit**

```
Update tests to pass port adapters
```

---

### Task 10: Verify no remaining storage imports in domain

**Step 1: Search for violations**

Run: `grep -r 'from "../../storage/' src/domain/notes/ src/domain/sync/noteSyncEngine.ts`

Expected: Only `noteRepository.ts` import in `repositoryFactory.ts` (the `NoteRepository` interface itself lives in storage — that's the existing public contract, not an internal storage detail).

**Step 2: Run full validation**

Run: `npm run typecheck && npm test -- --runInBand`
Expected: All pass.

**Step 3: Final commit**

```
Complete P1 boundary collapse fix

Domain layer accesses storage through NoteEnvelopePort and
RemoteDateIndexPort. NoteRecord/NoteMetaRecord types owned by domain.
Storage schema changes no longer propagate into business layer.
```

---

### Remaining storage imports after this plan

These are acceptable and out of scope:
- `storage/noteRepository.ts` — the `NoteRepository`/`SyncCapableNoteRepository` interface is the public repository contract (already fixed in P1 fat-contract work)
- `domain/images/hydratingImageRepository.ts` — same pattern, extractable later if needed
- `../../types` imports — shared app types, not storage internals
