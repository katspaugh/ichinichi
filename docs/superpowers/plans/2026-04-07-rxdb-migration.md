# RxDB Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom sync engine, IndexedDB access, and Zustand stores with RxDB as the primary data layer, using the Supabase replication plugin for sync and RxDB observables for reactivity.

**Architecture:** RxDB database per user account, two collections (notes, images). E2EE via push/pull modifiers on the replication plugin. Components subscribe to RxDB observables through thin React hooks. Vault, auth, and keyring layers remain unchanged.

**Tech Stack:** RxDB (core + storage-dexie + replication-supabase + attachments), rxjs, Supabase, React 19, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-07-rxdb-migration-design.md`

---

## File Structure

### New files

| File | Purpose |
|------|---------|
| `src/storage/rxdb/database.ts` | RxDB database creation, collection schemas, lifecycle |
| `src/storage/rxdb/schemas.ts` | JSON schemas for notes and images collections |
| `src/storage/rxdb/replication.ts` | Supabase replication setup with E2EE push/pull modifiers |
| `src/storage/rxdb/noteRepository.ts` | `NoteRepository` implementation backed by RxDB |
| `src/storage/rxdb/imageRepository.ts` | `ImageRepository` implementation backed by RxDB |
| `src/hooks/useRxDB.ts` | React hook + context for RxDB database instance |
| `src/hooks/useNote.ts` | Subscribe to a single note document |
| `src/hooks/useNoteDatesRx.ts` | Subscribe to the set of dates with notes |
| `src/hooks/useNoteImagesRx.ts` | Subscribe to images for a given note |
| `src/hooks/useSyncStatus.ts` | Subscribe to replication state |
| `src/storage/legacyMigration.ts` | Migrate legacy IndexedDB data to RxDB |
| `supabase/migrations/20260407_rxdb_schema.sql` | Supabase schema changes for RxDB replication |
| `src/__tests__/rxdb/database.test.ts` | Unit tests for database creation |
| `src/__tests__/rxdb/replication.test.ts` | Unit tests for push/pull modifiers |
| `src/__tests__/rxdb/noteRepository.test.ts` | Unit tests for RxDB note repository |
| `src/__tests__/rxdb/imageRepository.test.ts` | Unit tests for RxDB image repository |
| `src/__tests__/rxdb/hooks.test.ts` | Unit tests for RxDB React hooks |
| `src/__tests__/rxdb/legacyMigration.test.ts` | Unit tests for migration |

### Modified files

| File | Change |
|------|--------|
| `package.json` | Add rxdb, rxjs dependencies |
| `src/contexts/serviceContext.ts` | Remove `noteContentStore`, `syncStore`; add RxDB database type |
| `src/contexts/ServiceProvider.tsx` | Provide RxDB database instead of stores |
| `src/hooks/useNoteRepository.ts` | Rewrite to use RxDB hooks instead of Zustand |
| `src/hooks/useNoteContent.ts` | Rewrite to use `useNote()` instead of `noteContentStore` |
| `src/hooks/useNoteDates.ts` | Rewrite to use `useNoteDatesRx()` instead of Zustand |
| `src/hooks/useSync.ts` | Rewrite to use `useSyncStatus()` instead of `syncStore` |
| `src/controllers/useAppController.ts` | Simplify: remove store coordination |
| `src/components/SyncIndicator/SyncIndicator.tsx` | No change needed (already receives props) |
| `src/storage/parsers.ts` | Add parser for RxDB document shapes |

### Deleted files

| File/Directory | Reason |
|----------------|--------|
| `src/stores/syncStore.ts` | Replaced by RxDB replication state |
| `src/stores/noteContentStore.ts` | Replaced by RxDB reactive queries |
| `src/stores/noteDatesStore.ts` | Replaced by RxDB reactive queries |
| `src/stores/storeCoordinator.ts` | No longer needed |
| `src/domain/sync/noteSyncEngine.ts` | Replaced by RxDB replication plugin |
| `src/domain/sync/stateMachine.ts` | Replaced by RxDB replication plugin |
| `src/domain/sync/intentScheduler.ts` | Replaced by RxDB replication plugin |
| `src/domain/sync/pendingOpsSource.ts` | Replaced by RxDB replication plugin |
| `src/domain/sync/syncService.ts` | Replaced by RxDB replication plugin |
| `src/domain/sync/remoteNotesGateway.ts` | Replaced by RxDB replication plugin |
| `src/domain/notes/syncedNoteRepository.ts` | Replaced by RxDB note repository |
| `src/domain/notes/repositoryFactory.ts` | Replaced: single RxDB-backed repo for all modes |
| `src/hooks/useSyncedFactories.ts` | No longer needed |
| `src/storage/unifiedDb.ts` | Replaced by RxDB database |
| `src/storage/unifiedNoteStore.ts` | Replaced by RxDB collections |
| `src/storage/unifiedSyncStateStore.ts` | Replaced by RxDB replication internals |
| `src/storage/remoteNotesGateway.ts` | Replaced by RxDB replication plugin |

---

## Task 1: Install dependencies and verify setup

**Files:**
- Modify: `package.json`
- Create: `src/storage/rxdb/database.ts`
- Create: `src/storage/rxdb/schemas.ts`
- Create: `src/__tests__/rxdb/database.test.ts`

- [ ] **Step 1: Install rxdb and rxjs**

Run:
```bash
yarn add rxdb rxjs
```

- [ ] **Step 2: Write failing test for database creation**

Create `src/__tests__/rxdb/database.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { createAppDatabase, type AppDatabase } from "../../storage/rxdb/database";

describe("createAppDatabase", () => {
  let db: AppDatabase | null = null;

  afterEach(async () => {
    if (db) {
      await db.destroy();
      db = null;
    }
  });

  it("creates a database with notes and images collections", async () => {
    db = await createAppDatabase("test-user-123");
    expect(db.notes).toBeDefined();
    expect(db.images).toBeDefined();
  });

  it("notes collection has correct schema properties", async () => {
    db = await createAppDatabase("test-user-456");
    const schema = db.notes.schema.jsonSchema;
    expect(schema.primaryKey).toBe("date");
    expect(schema.properties).toHaveProperty("content");
    expect(schema.properties).toHaveProperty("updatedAt");
    expect(schema.properties).toHaveProperty("deleted");
  });

  it("images collection has correct schema properties", async () => {
    db = await createAppDatabase("test-user-789");
    const schema = db.images.schema.jsonSchema;
    expect(schema.primaryKey).toBe("id");
    expect(schema.properties).toHaveProperty("noteDate");
    expect(schema.properties).toHaveProperty("filename");
    expect(schema.properties).toHaveProperty("mimeType");
    expect(schema.properties).toHaveProperty("deleted");
  });

  it("images collection supports attachments", async () => {
    db = await createAppDatabase("test-user-att");
    expect(db.images.schema.jsonSchema.attachments).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/__tests__/rxdb/database.test.ts`
Expected: FAIL - module `../../storage/rxdb/database` does not exist.

- [ ] **Step 4: Create RxDB schemas**

Create `src/storage/rxdb/schemas.ts`:

```typescript
import type { RxJsonSchema } from "rxdb";

export interface NoteDocType {
  date: string;
  content: string;
  updatedAt: string;
  deleted: boolean;
  weather?: {
    icon: string;
    temperatureHigh: number;
    temperatureLow: number;
    unit: "C" | "F";
    city: string;
  } | null;
}

export interface ImageDocType {
  id: string;
  noteDate: string;
  type: "background" | "inline";
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
  deleted: boolean;
}

export const noteSchema: RxJsonSchema<NoteDocType> = {
  version: 0,
  primaryKey: "date",
  type: "object",
  properties: {
    date: { type: "string", maxLength: 10 },
    content: { type: "string" },
    updatedAt: { type: "string" },
    deleted: { type: "boolean" },
    weather: {
      type: ["object", "null"],
      properties: {
        icon: { type: "string" },
        temperatureHigh: { type: "number" },
        temperatureLow: { type: "number" },
        unit: { type: "string", enum: ["C", "F"] },
        city: { type: "string" },
      },
    },
  },
  required: ["date", "content", "updatedAt", "deleted"],
};

export const imageSchema: RxJsonSchema<ImageDocType> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    noteDate: { type: "string", maxLength: 10 },
    type: { type: "string", enum: ["background", "inline"] },
    filename: { type: "string" },
    mimeType: { type: "string" },
    width: { type: "number" },
    height: { type: "number" },
    size: { type: "number" },
    createdAt: { type: "string" },
    deleted: { type: "boolean" },
  },
  required: [
    "id", "noteDate", "type", "filename", "mimeType",
    "width", "height", "size", "createdAt", "deleted",
  ],
  indexes: ["noteDate"],
  attachments: {},
};
```

- [ ] **Step 5: Create database module**

Create `src/storage/rxdb/database.ts`:

```typescript
import { createRxDatabase, type RxDatabase, type RxCollection } from "rxdb/plugins/core";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import {
  noteSchema,
  imageSchema,
  type NoteDocType,
  type ImageDocType,
} from "./schemas";

export type NoteCollection = RxCollection<NoteDocType>;
export type ImageCollection = RxCollection<ImageDocType>;

export type AppCollections = {
  notes: NoteCollection;
  images: ImageCollection;
};

export type AppDatabase = RxDatabase<AppCollections>;

export async function createAppDatabase(
  userId: string,
  options?: { memory?: boolean },
): Promise<AppDatabase> {
  const storage = options?.memory
    ? getRxStorageMemory()
    : getRxStorageDexie();

  const db = await createRxDatabase<AppCollections>({
    name: `ichinichi-${userId}`,
    storage,
  });

  await db.addCollections({
    notes: { schema: noteSchema },
    images: { schema: imageSchema },
  });

  return db;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/__tests__/rxdb/database.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/storage/rxdb/schemas.ts src/storage/rxdb/database.ts src/__tests__/rxdb/database.test.ts package.json yarn.lock
git commit -m "feat: add RxDB database with notes and images collections"
```

---

## Task 2: RxDB note repository

**Files:**
- Create: `src/storage/rxdb/noteRepository.ts`
- Create: `src/__tests__/rxdb/noteRepository.test.ts`

- [ ] **Step 1: Write failing tests for RxDB note repository**

Create `src/__tests__/rxdb/noteRepository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAppDatabase, type AppDatabase } from "../../storage/rxdb/database";
import { createRxNoteRepository } from "../../storage/rxdb/noteRepository";
import type { NoteRepository } from "../../storage/noteRepository";

describe("RxDB NoteRepository", () => {
  let db: AppDatabase;
  let repo: NoteRepository;

  beforeEach(async () => {
    db = await createAppDatabase(`test-${Date.now()}`, { memory: true });
    repo = createRxNoteRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("returns null for a non-existent note", async () => {
    const result = await repo.get("01-01-2026");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("saves and retrieves a note", async () => {
    const saveResult = await repo.save("15-03-2026", "<p>Hello</p>");
    expect(saveResult.ok).toBe(true);

    const getResult = await repo.get("15-03-2026");
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value).not.toBeNull();
      expect(getResult.value!.date).toBe("15-03-2026");
      expect(getResult.value!.content).toBe("<p>Hello</p>");
    }
  });

  it("updates an existing note", async () => {
    await repo.save("15-03-2026", "<p>First</p>");
    await repo.save("15-03-2026", "<p>Second</p>");

    const result = await repo.get("15-03-2026");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value!.content).toBe("<p>Second</p>");
    }
  });

  it("soft-deletes a note", async () => {
    await repo.save("15-03-2026", "<p>Delete me</p>");
    const delResult = await repo.delete("15-03-2026");
    expect(delResult.ok).toBe(true);

    const result = await repo.get("15-03-2026");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("returns all dates with non-deleted notes", async () => {
    await repo.save("01-01-2026", "<p>A</p>");
    await repo.save("02-01-2026", "<p>B</p>");
    await repo.save("03-01-2026", "<p>C</p>");
    await repo.delete("02-01-2026");

    const result = await repo.getAllDates();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain("01-01-2026");
      expect(result.value).not.toContain("02-01-2026");
      expect(result.value).toContain("03-01-2026");
    }
  });

  it("returns dates filtered by year", async () => {
    await repo.save("15-03-2025", "<p>Old</p>");
    await repo.save("15-03-2026", "<p>New</p>");

    const result = await repo.getAllDatesForYear(2026);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain("15-03-2026");
      expect(result.value).not.toContain("15-03-2025");
    }
  });

  it("saves weather with a note", async () => {
    const weather = {
      icon: "sunny",
      temperatureHigh: 25,
      temperatureLow: 15,
      unit: "C" as const,
      city: "Tokyo",
    };
    await repo.save("15-03-2026", "<p>Sunny day</p>", weather);

    const result = await repo.get("15-03-2026");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value!.weather).toEqual(weather);
    }
  });

  it("restores a soft-deleted note", async () => {
    await repo.save("15-03-2026", "<p>Restore me</p>");
    await repo.delete("15-03-2026");

    const restoreResult = await repo.restoreNote!("15-03-2026");
    expect(restoreResult.ok).toBe(true);

    const result = await repo.get("15-03-2026");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/rxdb/noteRepository.test.ts`
Expected: FAIL - module `../../storage/rxdb/noteRepository` does not exist.

- [ ] **Step 3: Implement RxDB note repository**

Create `src/storage/rxdb/noteRepository.ts`:

```typescript
import type { NoteRepository } from "../noteRepository";
import type { Note, SavedWeather } from "../../types";
import type { Result } from "../../domain/result";
import type { RepositoryError } from "../../domain/errors";
import { ok, err } from "../../domain/result";
import { reportError } from "../../utils/errorReporter";
import type { AppDatabase } from "./database";

export function createRxNoteRepository(db: AppDatabase): NoteRepository {
  return {
    async get(date: string): Promise<Result<Note | null, RepositoryError>> {
      try {
        const doc = await db.notes.findOne(date).exec();
        if (!doc || doc.deleted) return ok(null);
        return ok({
          date: doc.date,
          content: doc.content,
          updatedAt: doc.updatedAt,
          weather: doc.weather ?? null,
        });
      } catch (error) {
        reportError("rxNoteRepository.get", error);
        return err({ type: "IO", message: "Failed to read note" });
      }
    },

    async save(
      date: string,
      content: string,
      weather?: SavedWeather | null,
    ): Promise<Result<void, RepositoryError>> {
      try {
        await db.notes.upsert({
          date,
          content,
          updatedAt: new Date().toISOString(),
          deleted: false,
          weather: weather ?? null,
        });
        return ok(undefined);
      } catch (error) {
        reportError("rxNoteRepository.save", error);
        return err({ type: "IO", message: "Failed to save note" });
      }
    },

    async delete(date: string): Promise<Result<void, RepositoryError>> {
      try {
        const doc = await db.notes.findOne(date).exec();
        if (doc) {
          await doc.patch({
            deleted: true,
            updatedAt: new Date().toISOString(),
          });
        }
        return ok(undefined);
      } catch (error) {
        reportError("rxNoteRepository.delete", error);
        return err({ type: "IO", message: "Failed to delete note" });
      }
    },

    async getAllDates(): Promise<Result<string[], RepositoryError>> {
      try {
        const docs = await db.notes
          .find({ selector: { deleted: false } })
          .exec();
        return ok(docs.map((d) => d.date));
      } catch (error) {
        reportError("rxNoteRepository.getAllDates", error);
        return err({ type: "IO", message: "Failed to get dates" });
      }
    },

    async getAllDatesForYear(
      year: number,
    ): Promise<Result<string[], RepositoryError>> {
      try {
        const suffix = `-${year}`;
        const docs = await db.notes
          .find({ selector: { deleted: false } })
          .exec();
        return ok(
          docs.filter((d) => d.date.endsWith(suffix)).map((d) => d.date),
        );
      } catch (error) {
        reportError("rxNoteRepository.getAllDatesForYear", error);
        return err({ type: "IO", message: "Failed to get dates for year" });
      }
    },

    async getIncludingDeleted(
      date: string,
    ): Promise<Result<Note | null, RepositoryError>> {
      try {
        const doc = await db.notes.findOne(date).exec();
        if (!doc) return ok(null);
        return ok({
          date: doc.date,
          content: doc.content,
          updatedAt: doc.updatedAt,
          weather: doc.weather ?? null,
        });
      } catch (error) {
        reportError("rxNoteRepository.getIncludingDeleted", error);
        return err({ type: "IO", message: "Failed to read note" });
      }
    },

    async restoreNote(
      date: string,
    ): Promise<Result<void, RepositoryError>> {
      try {
        const doc = await db.notes.findOne(date).exec();
        if (doc) {
          await doc.patch({
            deleted: false,
            updatedAt: new Date().toISOString(),
          });
        }
        return ok(undefined);
      } catch (error) {
        reportError("rxNoteRepository.restoreNote", error);
        return err({ type: "IO", message: "Failed to restore note" });
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/rxdb/noteRepository.test.ts`
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/rxdb/noteRepository.ts src/__tests__/rxdb/noteRepository.test.ts
git commit -m "feat: add RxDB-backed NoteRepository implementation"
```

---

## Task 3: RxDB image repository

**Files:**
- Create: `src/storage/rxdb/imageRepository.ts`
- Create: `src/__tests__/rxdb/imageRepository.test.ts`

- [ ] **Step 1: Write failing tests for RxDB image repository**

Create `src/__tests__/rxdb/imageRepository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAppDatabase, type AppDatabase } from "../../storage/rxdb/database";
import { createRxImageRepository } from "../../storage/rxdb/imageRepository";
import type { ImageRepository } from "../../storage/imageRepository";

describe("RxDB ImageRepository", () => {
  let db: AppDatabase;
  let repo: ImageRepository;

  beforeEach(async () => {
    db = await createAppDatabase(`test-img-${Date.now()}`, { memory: true });
    repo = createRxImageRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("uploads and retrieves an image", async () => {
    const blob = new Blob(["fake-image-data"], { type: "image/png" });
    const uploadResult = await repo.upload(
      "15-03-2026", blob, "inline", "photo.png", { width: 100, height: 50 },
    );
    expect(uploadResult.ok).toBe(true);
    if (!uploadResult.ok) return;

    const meta = uploadResult.value;
    expect(meta.noteDate).toBe("15-03-2026");
    expect(meta.filename).toBe("photo.png");
    expect(meta.mimeType).toBe("image/png");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);

    const getResult = await repo.get(meta.id);
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value).toBeInstanceOf(Blob);
    }
  });

  it("returns null for non-existent image", async () => {
    const result = await repo.get("nonexistent-id");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("gets images by note date", async () => {
    const blob = new Blob(["data"], { type: "image/jpeg" });
    await repo.upload("15-03-2026", blob, "inline", "a.jpg");
    await repo.upload("15-03-2026", blob, "background", "b.jpg");
    await repo.upload("16-03-2026", blob, "inline", "c.jpg");

    const result = await repo.getByNoteDate("15-03-2026");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  it("deletes an image", async () => {
    const blob = new Blob(["data"], { type: "image/png" });
    const upload = await repo.upload("15-03-2026", blob, "inline", "del.png");
    if (!upload.ok) return;

    const delResult = await repo.delete(upload.value.id);
    expect(delResult.ok).toBe(true);

    const getResult = await repo.get(upload.value.id);
    expect(getResult.ok).toBe(true);
    if (getResult.ok) expect(getResult.value).toBeNull();
  });

  it("deletes all images for a note date", async () => {
    const blob = new Blob(["data"], { type: "image/png" });
    await repo.upload("15-03-2026", blob, "inline", "a.png");
    await repo.upload("15-03-2026", blob, "inline", "b.png");

    const delResult = await repo.deleteByNoteDate("15-03-2026");
    expect(delResult.ok).toBe(true);

    const result = await repo.getByNoteDate("15-03-2026");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it("getUrl returns null for local-only repo", async () => {
    const blob = new Blob(["data"], { type: "image/png" });
    const upload = await repo.upload("15-03-2026", blob, "inline", "url.png");
    if (!upload.ok) return;

    const result = await repo.getUrl(upload.value.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/rxdb/imageRepository.test.ts`
Expected: FAIL - module does not exist.

- [ ] **Step 3: Implement RxDB image repository**

Create `src/storage/rxdb/imageRepository.ts`:

```typescript
import type { ImageRepository } from "../imageRepository";
import type { NoteImage } from "../../types";
import type { Result } from "../../domain/result";
import type { RepositoryError } from "../../domain/errors";
import { ok, err } from "../../domain/result";
import { reportError } from "../../utils/errorReporter";
import type { AppDatabase } from "./database";

export function createRxImageRepository(db: AppDatabase): ImageRepository {
  return {
    async upload(
      noteDate: string,
      file: Blob,
      type: "background" | "inline",
      filename: string,
      options?: { width?: number; height?: number },
    ): Promise<Result<NoteImage, RepositoryError>> {
      try {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        const doc = await db.images.insert({
          id,
          noteDate,
          type,
          filename,
          mimeType: file.type || "application/octet-stream",
          width: options?.width ?? 0,
          height: options?.height ?? 0,
          size: file.size,
          createdAt: now,
          deleted: false,
        });

        await doc.putAttachment({
          id: "blob",
          data: file,
          type: file.type || "application/octet-stream",
        });

        return ok({
          id,
          noteDate,
          type,
          filename,
          mimeType: file.type || "application/octet-stream",
          width: options?.width ?? 0,
          height: options?.height ?? 0,
          size: file.size,
          createdAt: now,
        });
      } catch (error) {
        reportError("rxImageRepository.upload", error);
        return err({ type: "IO", message: "Failed to upload image" });
      }
    },

    async get(
      imageId: string,
    ): Promise<Result<Blob | null, RepositoryError>> {
      try {
        const doc = await db.images.findOne(imageId).exec();
        if (!doc || doc.deleted) return ok(null);

        const attachment = doc.getAttachment("blob");
        if (!attachment) return ok(null);

        const blob = await attachment.getData();
        return ok(blob);
      } catch (error) {
        reportError("rxImageRepository.get", error);
        return err({ type: "IO", message: "Failed to get image" });
      }
    },

    async getUrl(
      _imageId: string,
    ): Promise<Result<string | null, RepositoryError>> {
      return ok(null);
    },

    async delete(
      imageId: string,
    ): Promise<Result<void, RepositoryError>> {
      try {
        const doc = await db.images.findOne(imageId).exec();
        if (doc) {
          await doc.patch({ deleted: true });
        }
        return ok(undefined);
      } catch (error) {
        reportError("rxImageRepository.delete", error);
        return err({ type: "IO", message: "Failed to delete image" });
      }
    },

    async getByNoteDate(
      noteDate: string,
    ): Promise<Result<NoteImage[], RepositoryError>> {
      try {
        const docs = await db.images
          .find({ selector: { noteDate, deleted: false } })
          .exec();
        return ok(
          docs.map((d) => ({
            id: d.id,
            noteDate: d.noteDate,
            type: d.type as "background" | "inline",
            filename: d.filename,
            mimeType: d.mimeType,
            width: d.width,
            height: d.height,
            size: d.size,
            createdAt: d.createdAt,
          })),
        );
      } catch (error) {
        reportError("rxImageRepository.getByNoteDate", error);
        return err({ type: "IO", message: "Failed to get images for date" });
      }
    },

    async deleteByNoteDate(
      noteDate: string,
    ): Promise<Result<void, RepositoryError>> {
      try {
        const docs = await db.images
          .find({ selector: { noteDate } })
          .exec();
        for (const doc of docs) {
          await doc.patch({ deleted: true });
        }
        return ok(undefined);
      } catch (error) {
        reportError("rxImageRepository.deleteByNoteDate", error);
        return err({
          type: "IO",
          message: "Failed to delete images for date",
        });
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/rxdb/imageRepository.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/rxdb/imageRepository.ts src/__tests__/rxdb/imageRepository.test.ts
git commit -m "feat: add RxDB-backed ImageRepository implementation"
```

---

## Task 4: Supabase replication with E2EE modifiers

**Files:**
- Create: `src/storage/rxdb/replication.ts`
- Create: `src/__tests__/rxdb/replication.test.ts`

- [ ] **Step 1: Write failing tests for push/pull modifiers**

Create `src/__tests__/rxdb/replication.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createPushModifier,
  createPullModifier,
  type ReplicationCrypto,
} from "../../storage/rxdb/replication";

function createMockCrypto(): ReplicationCrypto {
  return {
    async encrypt(payload) {
      return {
        ok: true as const,
        value: {
          ciphertext: btoa(JSON.stringify(payload)),
          nonce: "test-nonce",
          keyId: "key-1",
        },
      };
    },
    async decrypt(record) {
      const payload = JSON.parse(atob(record.ciphertext));
      return { ok: true as const, value: payload };
    },
  };
}

describe("createPushModifier", () => {
  it("encrypts note content for push", async () => {
    const crypto = createMockCrypto();
    const modifier = createPushModifier(crypto);

    const result = await modifier({
      date: "15-03-2026",
      content: "<p>Hello</p>",
      updatedAt: "2026-03-15T00:00:00Z",
      deleted: false,
      weather: null,
    });

    expect(result).toHaveProperty("date", "15-03-2026");
    expect(result).toHaveProperty("ciphertext");
    expect(result).toHaveProperty("nonce", "test-nonce");
    expect(result).toHaveProperty("key_id", "key-1");
    expect(result).toHaveProperty("_deleted", false);
    expect(result).not.toHaveProperty("content");
    expect(result).not.toHaveProperty("weather");
  });
});

describe("createPullModifier", () => {
  it("decrypts note content from pull", async () => {
    const crypto = createMockCrypto();
    const pullModifier = createPullModifier(crypto);

    const encrypted = {
      date: "15-03-2026",
      ciphertext: btoa(
        JSON.stringify({ content: "<p>Hello</p>", weather: null }),
      ),
      nonce: "test-nonce",
      key_id: "key-1",
      updated_at: "2026-03-15T00:00:00Z",
      _modified: "2026-03-15T00:00:01Z",
      _deleted: false,
    };

    const result = await pullModifier(encrypted);

    expect(result).toHaveProperty("date", "15-03-2026");
    expect(result).toHaveProperty("content", "<p>Hello</p>");
    expect(result).toHaveProperty("deleted", false);
    expect(result).not.toHaveProperty("ciphertext");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/rxdb/replication.test.ts`
Expected: FAIL - module does not exist.

- [ ] **Step 3: Implement replication module**

Create `src/storage/rxdb/replication.ts`:

```typescript
import { replicateSupabase } from "rxdb/plugins/replication-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RxReplicationState } from "rxdb/plugins/replication";
import type { Result } from "../../domain/result";
import type { NotePayload } from "../../domain/crypto/e2eeService";
import type { EncryptedNote } from "../../domain/crypto/noteCrypto";
import type { CryptoError } from "../../domain/errors";
import { reportError } from "../../utils/errorReporter";
import type { AppDatabase, NoteCollection } from "./database";
import type { NoteDocType } from "./schemas";

export interface ReplicationCrypto {
  encrypt(
    payload: NotePayload,
  ): Promise<Result<EncryptedNote, CryptoError>>;
  decrypt(record: {
    keyId?: string | null;
    ciphertext: string;
    nonce: string;
  }): Promise<Result<NotePayload, CryptoError>>;
}

interface SupabaseNoteRow {
  date: string;
  key_id: string;
  ciphertext: string;
  nonce: string;
  updated_at: string;
  _modified: string;
  _deleted: boolean;
}

export function createPushModifier(
  crypto: ReplicationCrypto,
): (doc: NoteDocType) => Promise<SupabaseNoteRow> {
  return async (doc: NoteDocType): Promise<SupabaseNoteRow> => {
    const encResult = await crypto.encrypt({
      content: doc.content,
      weather: doc.weather,
    });
    if (!encResult.ok) {
      throw new Error(
        `Encryption failed: ${encResult.error.message}`,
      );
    }
    return {
      date: doc.date,
      key_id: encResult.value.keyId,
      ciphertext: encResult.value.ciphertext,
      nonce: encResult.value.nonce,
      updated_at: doc.updatedAt,
      _modified: doc.updatedAt,
      _deleted: doc.deleted,
    };
  };
}

export function createPullModifier(
  crypto: ReplicationCrypto,
): (row: SupabaseNoteRow) => Promise<NoteDocType> {
  return async (row: SupabaseNoteRow): Promise<NoteDocType> => {
    if (row._deleted) {
      return {
        date: row.date,
        content: "",
        updatedAt: row.updated_at || row._modified,
        deleted: true,
        weather: null,
      };
    }
    const decResult = await crypto.decrypt({
      keyId: row.key_id,
      ciphertext: row.ciphertext,
      nonce: row.nonce,
    });
    if (!decResult.ok) {
      reportError(
        "replication.pull",
        new Error(decResult.error.message),
      );
      return {
        date: row.date,
        content: "",
        updatedAt: row.updated_at || row._modified,
        deleted: false,
        weather: null,
      };
    }
    return {
      date: row.date,
      content: decResult.value.content,
      updatedAt: row.updated_at || row._modified,
      deleted: false,
      weather: decResult.value.weather ?? null,
    };
  };
}

export interface ReplicationHandle {
  notes: RxReplicationState<NoteDocType, unknown>;
  cancel(): Promise<void>;
}

export function startReplication(
  db: AppDatabase,
  supabase: SupabaseClient,
  crypto: ReplicationCrypto,
  userId: string,
): ReplicationHandle {
  const notesReplication = replicateSupabase({
    collection: db.notes as NoteCollection,
    replicationIdentifier: `notes-${userId}`,
    supabaseClient: supabase,
    table: "notes",
    pull: {
      modifier: createPullModifier(crypto),
    },
    push: {
      modifier: createPushModifier(crypto),
    },
    live: true,
    deletedField: "_deleted",
    modifiedField: "_modified",
  });

  return {
    notes: notesReplication,
    async cancel() {
      await notesReplication.cancel();
    },
  };
}
```

**Note:** The `replicateSupabase` import and exact API may need adjustment based on the installed RxDB version. The push/pull modifier functions are the core testable logic. Image replication (metadata table + storage bucket blobs) will be added in Task 5.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/rxdb/replication.test.ts`
Expected: Both tests PASS (these test modifier functions in isolation, not the full replication setup).

- [ ] **Step 5: Commit**

```bash
git add src/storage/rxdb/replication.ts src/__tests__/rxdb/replication.test.ts
git commit -m "feat: add Supabase replication with E2EE push/pull modifiers"
```

---

## Task 5: Image replication with storage bucket

**Files:**
- Modify: `src/storage/rxdb/replication.ts`
- Create: `src/__tests__/rxdb/imageReplication.test.ts`

- [ ] **Step 1: Write failing tests for image push/pull modifiers**

Create `src/__tests__/rxdb/imageReplication.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createImagePushModifier,
  createImagePullModifier,
  type ImageReplicationCrypto,
  type StorageBucket,
} from "../../storage/rxdb/replication";

function createMockImageCrypto(): ImageReplicationCrypto {
  return {
    async encryptBlob(blob) {
      return {
        ok: true as const,
        value: {
          record: {
            version: 1 as const,
            id: "img-1",
            keyId: "key-1",
            ciphertext: "enc",
            nonce: "n",
          },
          sha256: "abc123",
          size: blob.size,
          keyId: "key-1",
        },
      };
    },
    async decryptBlob(_record, mimeType) {
      return {
        ok: true as const,
        value: new Blob(["decrypted"], { type: mimeType }),
      };
    },
  };
}

function createMockBucket(): StorageBucket {
  const store = new Map<string, Blob>();
  return {
    async upload(path, blob) {
      store.set(path, blob);
      return { ok: true as const, value: path };
    },
    async download(path) {
      const b = store.get(path);
      return b
        ? { ok: true as const, value: b }
        : { ok: false as const, error: "not found" };
    },
  };
}

describe("createImagePushModifier", () => {
  it("encrypts image blob and uploads to bucket", async () => {
    const crypto = createMockImageCrypto();
    const bucket = createMockBucket();
    const modifier = createImagePushModifier(
      crypto, bucket, "user-123",
    );

    const doc = {
      id: "img-1",
      noteDate: "15-03-2026",
      type: "inline" as const,
      filename: "photo.png",
      mimeType: "image/png",
      width: 100,
      height: 50,
      size: 1024,
      createdAt: "2026-03-15T00:00:00Z",
      deleted: false,
    };
    const blob = new Blob(["image-data"], { type: "image/png" });

    const result = await modifier(doc, blob);

    expect(result).toHaveProperty("id", "img-1");
    expect(result).toHaveProperty("key_id", "key-1");
    expect(result).toHaveProperty("nonce", "n");
    expect(result).toHaveProperty("sha256", "abc123");
    expect(result).toHaveProperty("_deleted", false);
  });
});

describe("createImagePullModifier", () => {
  it("downloads and decrypts image blob from bucket", async () => {
    const crypto = createMockImageCrypto();
    const bucket = createMockBucket();
    await bucket.upload(
      "user-123/img-1", new Blob(["encrypted"]),
    );

    const pullModifier = createImagePullModifier(
      crypto, bucket, "user-123",
    );

    const row = {
      id: "img-1",
      note_date: "15-03-2026",
      type: "inline",
      filename: "photo.png",
      mime_type: "image/png",
      width: 100,
      height: 50,
      size: 1024,
      created_at: "2026-03-15T00:00:00Z",
      nonce: "n",
      key_id: "key-1",
      sha256: "abc123",
      _modified: "2026-03-15T00:00:01Z",
      _deleted: false,
    };

    const result = await pullModifier(row);

    expect(result.doc).toHaveProperty("id", "img-1");
    expect(result.doc).toHaveProperty("noteDate", "15-03-2026");
    expect(result.doc).toHaveProperty("deleted", false);
    expect(result.blob).toBeInstanceOf(Blob);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/rxdb/imageReplication.test.ts`
Expected: FAIL - `createImagePushModifier` and `createImagePullModifier` don't exist.

- [ ] **Step 3: Add image replication to replication module**

Append the following to `src/storage/rxdb/replication.ts`:

```typescript
export interface ImageReplicationCrypto {
  encryptBlob(
    blob: Blob,
  ): Promise<
    Result<
      {
        record: {
          version: 1;
          id: string;
          keyId: string;
          ciphertext: string;
          nonce: string;
        };
        sha256: string;
        size: number;
        keyId: string;
      },
      CryptoError
    >
  >;
  decryptBlob(
    record: {
      keyId?: string | null;
      ciphertext: string;
      nonce: string;
    },
    mimeType: string,
  ): Promise<Result<Blob, CryptoError>>;
}

export interface StorageBucket {
  upload(
    path: string,
    blob: Blob,
  ): Promise<Result<string, string>>;
  download(path: string): Promise<Result<Blob, string>>;
}

interface SupabaseImageRow {
  id: string;
  note_date: string;
  type: string;
  filename: string;
  mime_type: string;
  width: number;
  height: number;
  size: number;
  created_at: string;
  key_id: string;
  nonce: string;
  sha256: string;
  _modified: string;
  _deleted: boolean;
}

export function createImagePushModifier(
  crypto: ImageReplicationCrypto,
  bucket: StorageBucket,
  userId: string,
): (
  doc: ImageDocType,
  blob: Blob,
) => Promise<SupabaseImageRow> {
  return async (doc, blob) => {
    const encResult = await crypto.encryptBlob(blob);
    if (!encResult.ok) {
      throw new Error(
        `Image encryption failed: ${encResult.error.message}`,
      );
    }

    const storagePath = `${userId}/${doc.id}`;
    const ciphertextBlob = new Blob([
      encResult.value.record.ciphertext,
    ]);
    const uploadResult = await bucket.upload(
      storagePath, ciphertextBlob,
    );
    if (!uploadResult.ok) {
      throw new Error(
        `Image upload failed: ${uploadResult.error}`,
      );
    }

    return {
      id: doc.id,
      note_date: doc.noteDate,
      type: doc.type,
      filename: doc.filename,
      mime_type: doc.mimeType,
      width: doc.width,
      height: doc.height,
      size: doc.size,
      created_at: doc.createdAt,
      key_id: encResult.value.keyId,
      nonce: encResult.value.record.nonce,
      sha256: encResult.value.sha256,
      _modified: doc.createdAt,
      _deleted: doc.deleted,
    };
  };
}

export function createImagePullModifier(
  crypto: ImageReplicationCrypto,
  bucket: StorageBucket,
  userId: string,
): (
  row: SupabaseImageRow,
) => Promise<{ doc: ImageDocType; blob: Blob | null }> {
  return async (row) => {
    const doc: ImageDocType = {
      id: row.id,
      noteDate: row.note_date,
      type: row.type as "background" | "inline",
      filename: row.filename,
      mimeType: row.mime_type,
      width: row.width,
      height: row.height,
      size: row.size,
      createdAt: row.created_at,
      deleted: row._deleted,
    };

    if (row._deleted) {
      return { doc, blob: null };
    }

    const storagePath = `${userId}/${row.id}`;
    const downloadResult = await bucket.download(storagePath);
    if (!downloadResult.ok) {
      reportError(
        "imageReplication.pull",
        new Error(`Download failed: ${downloadResult.error}`),
      );
      return { doc, blob: null };
    }

    const ciphertextStr = await downloadResult.value.text();
    const decResult = await crypto.decryptBlob(
      {
        keyId: row.key_id,
        ciphertext: ciphertextStr,
        nonce: row.nonce,
      },
      row.mime_type,
    );
    if (!decResult.ok) {
      reportError(
        "imageReplication.pull",
        new Error(decResult.error.message),
      );
      return { doc, blob: null };
    }

    return { doc, blob: decResult.value };
  };
}
```

Also add the `ImageDocType` import at the top of the file:

```typescript
import type { NoteDocType, ImageDocType } from "./schemas";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/rxdb/imageReplication.test.ts`
Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/rxdb/replication.ts src/__tests__/rxdb/imageReplication.test.ts
git commit -m "feat: add image replication with storage bucket encryption"
```

---

## Task 6: Supabase SQL migration

**Files:**
- Create: `supabase/migrations/20260407_rxdb_schema.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260407_rxdb_schema.sql`:

```sql
-- Migration: Adapt schema for RxDB Supabase replication plugin

-- Enable moddatetime extension (used by RxDB for _modified auto-update)
create extension if not exists "moddatetime" schema "extensions";

-- 1) notes table: add _modified and _deleted columns for RxDB replication

alter table public.notes
  add column if not exists _modified timestamptz default now();

update public.notes
  set _modified = coalesce(server_updated_at, now())
  where _modified is null;

alter table public.notes
  add column if not exists _deleted boolean not null default false;

update public.notes set _deleted = deleted;

-- Drop the old trigger that sets server_updated_at
drop trigger if exists notes_set_server_updated_at on public.notes;

-- Create moddatetime trigger for _modified on UPDATE
create trigger notes_set_modified
  before update on public.notes
  for each row
  execute function extensions.moddatetime('_modified');

-- Set _modified on INSERT as well
create or replace function public.set_notes_modified_on_insert()
returns trigger language plpgsql as $$
begin
  new._modified := now();
  return new;
end;
$$;

create trigger notes_set_modified_on_insert
  before insert on public.notes
  for each row
  execute function public.set_notes_modified_on_insert();

-- Index for replication cursor queries
create index if not exists notes_user_modified_idx
  on public.notes(user_id, _modified);

-- Enable Realtime for live replication
alter publication supabase_realtime add table public.notes;

-- 2) note_images table: add _modified and _deleted columns

alter table public.note_images
  add column if not exists _modified timestamptz default now();

update public.note_images
  set _modified = coalesce(server_updated_at, now())
  where _modified is null;

alter table public.note_images
  add column if not exists _deleted boolean not null default false;

update public.note_images set _deleted = deleted;

-- Drop old trigger
drop trigger if exists note_images_set_server_updated_at
  on public.note_images;

-- Create moddatetime trigger for _modified on UPDATE
create trigger note_images_set_modified
  before update on public.note_images
  for each row
  execute function extensions.moddatetime('_modified');

create or replace function public.set_note_images_modified_on_insert()
returns trigger language plpgsql as $$
begin
  new._modified := now();
  return new;
end;
$$;

create trigger note_images_set_modified_on_insert
  before insert on public.note_images
  for each row
  execute function public.set_note_images_modified_on_insert();

create index if not exists note_images_user_modified_idx
  on public.note_images(user_id, _modified);

-- Enable Realtime for image metadata
alter publication supabase_realtime add table public.note_images;

-- 3) Drop RPCs no longer needed (replication plugin does direct upserts)
drop function if exists public.push_note;
drop function if exists public.delete_note;
```

- [ ] **Step 2: Verify the migration is idempotent**

Check that all statements use `if not exists`/`if exists` and handle backfill safely.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260407_rxdb_schema.sql
git commit -m "feat: add Supabase migration for RxDB replication schema"
```

---

## Task 7: React hooks for RxDB reactivity

**Files:**
- Create: `src/hooks/useRxDB.ts`
- Create: `src/hooks/useNote.ts`
- Create: `src/hooks/useNoteDatesRx.ts`
- Create: `src/hooks/useNoteImagesRx.ts`
- Create: `src/hooks/useSyncStatus.ts`
- Create: `src/__tests__/rxdb/hooks.test.ts`

- [ ] **Step 1: Write failing tests for hooks**

Create `src/__tests__/rxdb/hooks.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
  createAppDatabase,
  type AppDatabase,
} from "../../storage/rxdb/database";
import { RxDBProvider, useRxDB } from "../../hooks/useRxDB";
import { useNote } from "../../hooks/useNote";
import { useNoteDatesRx } from "../../hooks/useNoteDatesRx";
import { useNoteImagesRx } from "../../hooks/useNoteImagesRx";

describe("RxDB hooks", () => {
  let db: AppDatabase;

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(RxDBProvider, { db }, children);
  }

  beforeEach(async () => {
    db = await createAppDatabase(
      `hooks-test-${Date.now()}`,
      { memory: true },
    );
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("useRxDB", () => {
    it("provides the database instance", () => {
      const { result } = renderHook(() => useRxDB(), {
        wrapper: Wrapper,
      });
      expect(result.current).toBe(db);
    });
  });

  describe("useNote", () => {
    it("returns null for a non-existent note", () => {
      const { result } = renderHook(
        () => useNote("01-01-2026"),
        { wrapper: Wrapper },
      );
      expect(result.current.note).toBeNull();
      expect(result.current.loading).toBe(true);
    });

    it("returns note data after insertion", async () => {
      const { result } = renderHook(
        () => useNote("15-03-2026"),
        { wrapper: Wrapper },
      );

      await act(async () => {
        await db.notes.upsert({
          date: "15-03-2026",
          content: "<p>Test</p>",
          updatedAt: new Date().toISOString(),
          deleted: false,
          weather: null,
        });
      });

      await waitFor(() => {
        expect(result.current.note).not.toBeNull();
        expect(result.current.note?.content).toBe("<p>Test</p>");
      });
    });
  });

  describe("useNoteDatesRx", () => {
    it("returns empty set initially", () => {
      const { result } = renderHook(() => useNoteDatesRx(), {
        wrapper: Wrapper,
      });
      expect(result.current.size).toBe(0);
    });

    it("updates when notes are added", async () => {
      const { result } = renderHook(() => useNoteDatesRx(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await db.notes.upsert({
          date: "15-03-2026",
          content: "<p>A</p>",
          updatedAt: new Date().toISOString(),
          deleted: false,
          weather: null,
        });
      });

      await waitFor(() => {
        expect(result.current.has("15-03-2026")).toBe(true);
      });
    });
  });

  describe("useNoteImagesRx", () => {
    it("returns empty array when no images", () => {
      const { result } = renderHook(
        () => useNoteImagesRx("15-03-2026"),
        { wrapper: Wrapper },
      );
      expect(result.current).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/rxdb/hooks.test.ts`
Expected: FAIL - hook modules don't exist.

- [ ] **Step 3: Implement RxDBProvider and useRxDB**

Create `src/hooks/useRxDB.ts`:

```typescript
import {
  createContext,
  useContext,
  createElement,
  type ReactNode,
} from "react";
import type { AppDatabase } from "../storage/rxdb/database";

const RxDBContext = createContext<AppDatabase | null>(null);

export function RxDBProvider({
  db,
  children,
}: {
  db: AppDatabase;
  children: ReactNode;
}) {
  return createElement(
    RxDBContext.Provider,
    { value: db },
    children,
  );
}

export function useRxDB(): AppDatabase {
  const db = useContext(RxDBContext);
  if (!db) {
    throw new Error(
      "useRxDB must be used within RxDBProvider",
    );
  }
  return db;
}
```

- [ ] **Step 4: Implement useNote**

Create `src/hooks/useNote.ts`:

```typescript
import { useState, useEffect } from "react";
import type { Note } from "../types";
import { useRxDB } from "./useRxDB";

interface UseNoteReturn {
  note: Note | null;
  loading: boolean;
}

export function useNote(date: string | null): UseNoteReturn {
  const db = useRxDB();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!date) {
      setNote(null);
      setLoading(false);
      return;
    }

    const sub = db.notes
      .findOne(date)
      .$.subscribe((doc) => {
        if (!doc || doc.deleted) {
          setNote(null);
        } else {
          setNote({
            date: doc.date,
            content: doc.content,
            updatedAt: doc.updatedAt,
            weather: doc.weather ?? null,
          });
        }
        setLoading(false);
      });

    return () => sub.unsubscribe();
  }, [db, date]);

  return { note, loading };
}
```

- [ ] **Step 5: Implement useNoteDatesRx**

Create `src/hooks/useNoteDatesRx.ts`:

```typescript
import { useState, useEffect } from "react";
import { useRxDB } from "./useRxDB";

export function useNoteDatesRx(year?: number): Set<string> {
  const db = useRxDB();
  const [dates, setDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sub = db.notes
      .find({ selector: { deleted: false } })
      .$.subscribe((docs) => {
        const allDates = docs.map((d) => d.date);
        const filtered = year
          ? allDates.filter((d) => d.endsWith(`-${year}`))
          : allDates;
        setDates(new Set(filtered));
      });

    return () => sub.unsubscribe();
  }, [db, year]);

  return dates;
}
```

- [ ] **Step 6: Implement useNoteImagesRx**

Create `src/hooks/useNoteImagesRx.ts`:

```typescript
import { useState, useEffect } from "react";
import type { NoteImage } from "../types";
import { useRxDB } from "./useRxDB";

export function useNoteImagesRx(
  noteDate: string | null,
): NoteImage[] {
  const db = useRxDB();
  const [images, setImages] = useState<NoteImage[]>([]);

  useEffect(() => {
    if (!noteDate) {
      setImages([]);
      return;
    }

    const sub = db.images
      .find({ selector: { noteDate, deleted: false } })
      .$.subscribe((docs) => {
        setImages(
          docs.map((d) => ({
            id: d.id,
            noteDate: d.noteDate,
            type: d.type as "background" | "inline",
            filename: d.filename,
            mimeType: d.mimeType,
            width: d.width,
            height: d.height,
            size: d.size,
            createdAt: d.createdAt,
          })),
        );
      });

    return () => sub.unsubscribe();
  }, [db, noteDate]);

  return images;
}
```

- [ ] **Step 7: Implement useSyncStatus**

Create `src/hooks/useSyncStatus.ts`:

```typescript
import { useState, useEffect } from "react";
import type { SyncStatus } from "../types";
import { SyncStatus as SyncStatusEnum } from "../types";
import type { ReplicationHandle } from "../storage/rxdb/replication";

interface UseSyncStatusReturn {
  status: SyncStatus;
  error: string | null;
}

export function useSyncStatus(
  replication: ReplicationHandle | null,
): UseSyncStatusReturn {
  const [status, setStatus] = useState<SyncStatus>(
    SyncStatusEnum.Idle,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!replication) {
      setStatus(SyncStatusEnum.Idle);
      setError(null);
      return;
    }

    let wasActive = false;
    const subs = [
      replication.notes.active$.subscribe((active) => {
        if (active) {
          setStatus(SyncStatusEnum.Syncing);
        } else if (wasActive) {
          setStatus(SyncStatusEnum.Synced);
        }
        wasActive = active;
      }),

      replication.notes.error$.subscribe((err) => {
        if (err) {
          setStatus(SyncStatusEnum.Error);
          setError(err.message ?? "Sync error");
        } else {
          setError(null);
        }
      }),
    ];

    return () => subs.forEach((s) => s.unsubscribe());
  }, [replication]);

  return { status, error };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/__tests__/rxdb/hooks.test.ts`
Expected: All hook tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useRxDB.ts src/hooks/useNote.ts src/hooks/useNoteDatesRx.ts src/hooks/useNoteImagesRx.ts src/hooks/useSyncStatus.ts src/__tests__/rxdb/hooks.test.ts
git commit -m "feat: add React hooks for RxDB reactive queries"
```

---

## Task 8: Legacy data migration

**Files:**
- Create: `src/storage/legacyMigration.ts`
- Create: `src/__tests__/rxdb/legacyMigration.test.ts`

- [ ] **Step 1: Write failing tests for migration**

Create `src/__tests__/rxdb/legacyMigration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createAppDatabase,
  type AppDatabase,
} from "../../storage/rxdb/database";
import {
  migrateLegacyData,
  type LegacyDataSource,
} from "../../storage/legacyMigration";

function createMockLegacySource(
  notes: Array<{
    date: string;
    content: string;
    updatedAt: string;
    weather?: {
      icon: string;
      temperatureHigh: number;
      temperatureLow: number;
      unit: "C" | "F";
      city: string;
    } | null;
  }>,
): LegacyDataSource {
  return {
    async getNotes() {
      return notes.map((n) => ({
        date: n.date,
        content: n.content,
        updatedAt: n.updatedAt,
        weather: n.weather ?? null,
      }));
    },
    async getImages() {
      return [];
    },
    async getImageBlob() {
      return null;
    },
    async destroy() {},
  };
}

describe("migrateLegacyData", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = await createAppDatabase(
      `migrate-test-${Date.now()}`,
      { memory: true },
    );
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("migrates notes from legacy source to RxDB", async () => {
    const source = createMockLegacySource([
      {
        date: "01-01-2026",
        content: "<p>First</p>",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        date: "02-01-2026",
        content: "<p>Second</p>",
        updatedAt: "2026-01-02T00:00:00Z",
      },
    ]);

    await migrateLegacyData(db, source);

    const doc1 = await db.notes.findOne("01-01-2026").exec();
    expect(doc1).not.toBeNull();
    expect(doc1!.content).toBe("<p>First</p>");

    const doc2 = await db.notes.findOne("02-01-2026").exec();
    expect(doc2).not.toBeNull();
    expect(doc2!.content).toBe("<p>Second</p>");
  });

  it("preserves weather data during migration", async () => {
    const weather = {
      icon: "rain",
      temperatureHigh: 18,
      temperatureLow: 10,
      unit: "C" as const,
      city: "London",
    };
    const source = createMockLegacySource([
      {
        date: "01-01-2026",
        content: "<p>Rainy</p>",
        updatedAt: "2026-01-01T00:00:00Z",
        weather,
      },
    ]);

    await migrateLegacyData(db, source);

    const doc = await db.notes.findOne("01-01-2026").exec();
    expect(doc!.weather).toEqual(weather);
  });

  it("skips already-existing notes (idempotent)", async () => {
    await db.notes.upsert({
      date: "01-01-2026",
      content: "<p>Already here</p>",
      updatedAt: "2026-01-01T12:00:00Z",
      deleted: false,
      weather: null,
    });

    const source = createMockLegacySource([
      {
        date: "01-01-2026",
        content: "<p>From legacy</p>",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    await migrateLegacyData(db, source);

    const doc = await db.notes.findOne("01-01-2026").exec();
    expect(doc!.content).toBe("<p>Already here</p>");
  });

  it("calls destroy on legacy source after migration", async () => {
    const source = createMockLegacySource([]);
    const destroySpy = vi.spyOn(source, "destroy");

    await migrateLegacyData(db, source);

    expect(destroySpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/rxdb/legacyMigration.test.ts`
Expected: FAIL - module does not exist.

- [ ] **Step 3: Implement legacy migration**

Create `src/storage/legacyMigration.ts`:

```typescript
import { reportError } from "../utils/errorReporter";
import type { AppDatabase } from "./rxdb/database";
import type { SavedWeather } from "../types";

export interface LegacyNote {
  date: string;
  content: string;
  updatedAt: string;
  weather?: SavedWeather | null;
}

export interface LegacyImageMeta {
  id: string;
  noteDate: string;
  type: "background" | "inline";
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
}

export interface LegacyDataSource {
  getNotes(): Promise<LegacyNote[]>;
  getImages(): Promise<LegacyImageMeta[]>;
  getImageBlob(id: string): Promise<Blob | null>;
  destroy(): Promise<void>;
}

export async function migrateLegacyData(
  db: AppDatabase,
  source: LegacyDataSource,
): Promise<void> {
  try {
    const notes = await source.getNotes();
    for (const note of notes) {
      const existing = await db.notes
        .findOne(note.date)
        .exec();
      if (existing) continue;

      await db.notes.insert({
        date: note.date,
        content: note.content,
        updatedAt: note.updatedAt,
        deleted: false,
        weather: note.weather ?? null,
      });
    }

    const images = await source.getImages();
    for (const meta of images) {
      const existing = await db.images
        .findOne(meta.id)
        .exec();
      if (existing) continue;

      const doc = await db.images.insert({
        id: meta.id,
        noteDate: meta.noteDate,
        type: meta.type,
        filename: meta.filename,
        mimeType: meta.mimeType,
        width: meta.width,
        height: meta.height,
        size: meta.size,
        createdAt: meta.createdAt,
        deleted: false,
      });

      const blob = await source.getImageBlob(meta.id);
      if (blob) {
        await doc.putAttachment({
          id: "blob",
          data: blob,
          type: meta.mimeType,
        });
      }
    }

    await source.destroy();
  } catch (error) {
    reportError("legacyMigration", error);
    throw error;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/rxdb/legacyMigration.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/legacyMigration.ts src/__tests__/rxdb/legacyMigration.test.ts
git commit -m "feat: add legacy IndexedDB to RxDB data migration"
```

---

## Task 9: Wire RxDB into app bootstrap

**Files:**
- Modify: `src/contexts/serviceContext.ts`
- Modify: `src/contexts/ServiceProvider.tsx`
- Modify: `src/hooks/useNoteRepository.ts`
- Modify: `src/controllers/useAppController.ts`

- [ ] **Step 1: Update ServiceContext to remove store types**

Modify `src/contexts/serviceContext.ts` to remove `NoteContentStore` and `SyncStore` imports. The interface becomes:

```typescript
import { createContext, useContext } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VaultService } from "../domain/vault";
import type { E2eeServiceFactory } from "../domain/crypto/e2eeService";

export interface ServiceContextValue {
  supabase: SupabaseClient;
  vaultService: VaultService;
  e2eeFactory: E2eeServiceFactory;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

export function useServiceContext(): ServiceContextValue {
  const context = useContext(ServiceContext);
  if (!context) {
    throw new Error(
      "useServiceContext must be used within ServiceProvider",
    );
  }
  return context;
}

export { ServiceContext };
```

- [ ] **Step 2: Rewrite useNoteRepository to use RxDB**

Replace `src/hooks/useNoteRepository.ts` with a version that uses RxDB hooks, creates replication on cloud mode, and manages content editing with debounced saves. Key changes:

- Remove all Zustand store imports (`useNoteContent`, `useSync`, `useNoteDates`, `useSyncedFactories`, `useRepositoryFactory`, `createStoreCoordinator`)
- Import new RxDB hooks (`useRxDB`, `useNote`, `useNoteDatesRx`, `useSyncStatus`)
- Import `createRxNoteRepository`, `createRxImageRepository`, `startReplication`
- Create replication in a `useEffect` gated on `mode === AppMode.Cloud && vault unlocked`
- Content editing: subscribe via `useNote(date)`, debounce saves via `repository.save()`
- Keep the same `UseNoteRepositoryReturn` shape so consumers don't change

- [ ] **Step 3: Update ServiceProvider**

Read `src/contexts/ServiceProvider.tsx`, remove store creation, only provide `supabase`, `vaultService`, `e2eeFactory`.

- [ ] **Step 4: Add RxDBProvider to app tree**

Wrap the component tree with `RxDBProvider` at a point where `userId` is known. The database is created in a `useMemo`/`useEffect` keyed on `userId`. When `userId` is null (signed out or local mode), use a default local database.

- [ ] **Step 5: Simplify useAppController**

Remove `syncStore`/`noteContentStore` from `useServiceContext()` destructuring. The controller itself is already thin; it should still call `useNoteRepository` which now internally handles everything via RxDB.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Fix any type errors from modified interfaces.

- [ ] **Step 7: Run tests**

Run: `npm test`
Fix failures from wiring changes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: wire RxDB into app bootstrap, replace Zustand stores"
```

---

## Task 10: Delete legacy files

**Files:**
- Delete: all files listed in the "Deleted files" table above

- [ ] **Step 1: Delete store files**

```bash
rm src/stores/syncStore.ts src/stores/noteContentStore.ts src/stores/noteDatesStore.ts src/stores/storeCoordinator.ts
```

- [ ] **Step 2: Delete sync domain**

```bash
rm -r src/domain/sync/
```

- [ ] **Step 3: Delete old repository factories and storage adapters**

```bash
rm src/domain/notes/syncedNoteRepository.ts src/domain/notes/repositoryFactory.ts
rm src/hooks/useSyncedFactories.ts
rm src/storage/unifiedDb.ts src/storage/unifiedNoteStore.ts src/storage/unifiedSyncStateStore.ts src/storage/remoteNotesGateway.ts
```

- [ ] **Step 4: Delete old hook wrappers**

```bash
rm src/hooks/useNoteContent.ts src/hooks/useSync.ts src/hooks/useNoteDates.ts
```

- [ ] **Step 5: Fix all broken imports**

Search for remaining imports of deleted modules and update each file:

```bash
grep -r "from.*stores/" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v __tests__
grep -r "from.*domain/sync" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v __tests__
grep -r "from.*unifiedDb\|unifiedNoteStore\|unifiedSyncStateStore\|remoteNotesGateway" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v __tests__
```

- [ ] **Step 6: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Fix remaining errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy sync engine, Zustand stores, and old storage layer"
```

---

## Task 11: Update remaining component integrations

**Files:**
- Modify: components that reference old hooks or store APIs

- [ ] **Step 1: Find old hook usage in components**

```bash
grep -r "useNoteContent\|useSync\b\|useNoteDates\b\|useSyncedFactories\|useRepositoryFactory" src/components/ src/controllers/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: Update each component**

For each hit, replace old hook with the equivalent from `useNoteRepository` (which now uses RxDB internally). The `SyncIndicator` receives props and needs no changes.

- [ ] **Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: update components to use RxDB-backed hooks"
```

---

## Task 12: Clean up old tests

**Files:**
- Delete/modify: tests that reference deleted modules

- [ ] **Step 1: Find old tests**

```bash
grep -rl "noteContentStore\|syncStore\|noteDatesStore\|storeCoordinator\|noteSyncEngine\|syncedNoteRepository\|repositoryFactory" src/__tests__/ --include="*.ts" --include="*.tsx"
```

Delete test files entirely about deleted modules. Update tests that partially reference them.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: clean up old tests for removed modules"
```

---

## Task 13: End-to-end verification

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 2: Tests**

Run: `npm test`

- [ ] **Step 3: Lint**

Run: `npm run lint`

- [ ] **Step 4: Build**

Run: `npm run build`

- [ ] **Step 5: Fix remaining issues**

Iterate until all 4 commands pass.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "fix: resolve remaining issues from RxDB migration"
```
