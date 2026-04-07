import { describe, it, expect, vi, afterEach } from "vitest";
import { createAppDatabase, type AppDatabase } from "../../storage/rxdb/database";
import { migrateLegacyData, type LegacyDataSource, type LegacyNote, type LegacyImageMeta } from "../../storage/legacyMigration";

describe("migrateLegacyData", () => {
  let db: AppDatabase | null = null;

  afterEach(async () => {
    if (db) {
      await db.close();
      db = null;
    }
  });

  async function makeDb() {
    db = await createAppDatabase(`test-migration-${Date.now()}-${Math.random()}`, { memory: true });
    return db;
  }

  function makeMockSource(
    notes: LegacyNote[] = [],
    images: LegacyImageMeta[] = [],
    blobs: Record<string, Blob> = {},
  ): LegacyDataSource {
    return {
      getNotes: vi.fn().mockResolvedValue(notes),
      getImages: vi.fn().mockResolvedValue(images),
      getImageBlob: vi.fn().mockImplementation((id: string) =>
        Promise.resolve(blobs[id] ?? null),
      ),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("migrates notes from legacy source to RxDB", async () => {
    const database = await makeDb();
    const notes: LegacyNote[] = [
      { date: "01-01-2024", content: "Hello world", updatedAt: "2024-01-01T10:00:00Z" },
      { date: "15-06-2024", content: "Summer note", updatedAt: "2024-06-15T08:30:00Z" },
    ];
    const source = makeMockSource(notes);

    await migrateLegacyData(database, source);

    const doc1 = await database.notes.findOne("01-01-2024").exec();
    expect(doc1).not.toBeNull();
    expect(doc1?.content).toBe("Hello world");
    expect(doc1?.updatedAt).toBe("2024-01-01T10:00:00Z");
    expect(doc1?.isDeleted).toBe(false);

    const doc2 = await database.notes.findOne("15-06-2024").exec();
    expect(doc2).not.toBeNull();
    expect(doc2?.content).toBe("Summer note");
  });

  it("preserves weather data during migration", async () => {
    const database = await makeDb();
    const weather = {
      icon: "sunny",
      temperatureHigh: 28,
      temperatureLow: 18,
      unit: "C" as const,
      city: "Tokyo",
    };
    const notes: LegacyNote[] = [
      {
        date: "25-07-2024",
        content: "Hot day",
        updatedAt: "2024-07-25T12:00:00Z",
        weather,
      },
    ];
    const source = makeMockSource(notes);

    await migrateLegacyData(database, source);

    const doc = await database.notes.findOne("25-07-2024").exec();
    expect(doc).not.toBeNull();
    expect(doc?.weather).toEqual(weather);
  });

  it("skips already-existing notes (idempotent)", async () => {
    const database = await makeDb();

    // Pre-insert a note
    await database.notes.insert({
      date: "10-03-2024",
      content: "Existing note",
      updatedAt: "2024-03-10T09:00:00Z",
      isDeleted: false,
    });

    const notes: LegacyNote[] = [
      { date: "10-03-2024", content: "Legacy version", updatedAt: "2024-03-10T08:00:00Z" },
    ];
    const source = makeMockSource(notes);

    // Should not throw, should not overwrite
    await migrateLegacyData(database, source);

    const doc = await database.notes.findOne("10-03-2024").exec();
    expect(doc?.content).toBe("Existing note");
  });

  it("calls destroy on legacy source after migration", async () => {
    const database = await makeDb();
    const source = makeMockSource();

    await migrateLegacyData(database, source);

    expect(source.destroy).toHaveBeenCalledOnce();
  });

  it("migrates images from legacy source to RxDB", async () => {
    const database = await makeDb();
    const images: LegacyImageMeta[] = [
      {
        id: "img-001",
        noteDate: "20-04-2024",
        type: "inline",
        filename: "photo.png",
        mimeType: "image/png",
        width: 800,
        height: 600,
        size: 1024,
        createdAt: "2024-04-20T14:00:00Z",
      },
    ];
    const blob = new Blob(["fake-png-data"], { type: "image/png" });
    const source = makeMockSource([], images, { "img-001": blob });

    await migrateLegacyData(database, source);

    const doc = await database.images.findOne("img-001").exec();
    expect(doc).not.toBeNull();
    expect(doc?.noteDate).toBe("20-04-2024");
    expect(doc?.filename).toBe("photo.png");
    expect(doc?.isDeleted).toBe(false);

    const attachment = doc?.getAttachment("blob");
    expect(attachment).not.toBeNull();
  });

  it("skips already-existing images (idempotent)", async () => {
    const database = await makeDb();

    // Pre-insert image
    await database.images.insert({
      id: "img-existing",
      noteDate: "05-05-2024",
      type: "background",
      filename: "existing.jpg",
      mimeType: "image/jpeg",
      width: 1920,
      height: 1080,
      size: 2048,
      createdAt: "2024-05-05T10:00:00Z",
      isDeleted: false,
    });

    const images: LegacyImageMeta[] = [
      {
        id: "img-existing",
        noteDate: "05-05-2024",
        type: "background",
        filename: "legacy.jpg",
        mimeType: "image/jpeg",
        width: 1920,
        height: 1080,
        size: 2048,
        createdAt: "2024-05-05T10:00:00Z",
      },
    ];
    const source = makeMockSource([], images);

    await migrateLegacyData(database, source);

    const doc = await database.images.findOne("img-existing").exec();
    // Filename should remain unchanged (not overwritten)
    expect(doc?.filename).toBe("existing.jpg");
  });

  it("handles missing image blobs gracefully", async () => {
    const database = await makeDb();
    const images: LegacyImageMeta[] = [
      {
        id: "img-no-blob",
        noteDate: "15-08-2024",
        type: "inline",
        filename: "missing.png",
        mimeType: "image/png",
        width: 100,
        height: 100,
        size: 512,
        createdAt: "2024-08-15T10:00:00Z",
      },
    ];
    // No blob provided — getImageBlob returns null
    const source = makeMockSource([], images, {});

    // Should not throw
    await expect(migrateLegacyData(database, source)).resolves.toBeUndefined();

    // Metadata should still be inserted
    const doc = await database.images.findOne("img-no-blob").exec();
    expect(doc).not.toBeNull();
  });
});
