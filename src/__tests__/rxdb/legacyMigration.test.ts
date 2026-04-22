import { describe, it, expect, vi, afterEach } from "vitest";
import { createAppDatabase, type AppDatabase } from "../../storage/rxdb/database";
import {
  migrateLegacyData,
  type LegacyDataSource,
  type LegacyEncryptedNote,
  type LegacyImageMeta,
  type LegacyEncryptedImageData,
} from "../../storage/legacyMigration";
import type { E2eeService, NotePayload } from "../../domain/crypto/e2eeService";

function makeE2ee(overrides: Partial<E2eeService> = {}): E2eeService {
  const decryptNoteRecord = vi.fn(async (record: { ciphertext: string }) => {
    try {
      return JSON.parse(record.ciphertext) as NotePayload;
    } catch {
      return null;
    }
  });
  const decryptImageRecord = vi.fn(
    async (record: { ciphertext: string }, mimeType: string) => {
      if (record.ciphertext === "__fail__") return null;
      return new Blob([record.ciphertext], { type: mimeType });
    },
  );
  return {
    encryptNoteContent: vi.fn().mockResolvedValue(null),
    decryptNoteRecord,
    encryptImageBlob: vi.fn().mockResolvedValue(null),
    decryptImageRecord,
    ...overrides,
  };
}

function encryptedNote(
  date: string,
  content: string,
  updatedAt = "2024-01-01T00:00:00Z",
  weather: NotePayload["weather"] = null,
): LegacyEncryptedNote {
  return {
    date,
    keyId: "k1",
    ciphertext: JSON.stringify({ content, weather }),
    nonce: "n",
    updatedAt,
  };
}

function makeMockSource(
  notes: LegacyEncryptedNote[] = [],
  images: LegacyImageMeta[] = [],
  imageData: Record<string, LegacyEncryptedImageData> = {},
): LegacyDataSource {
  return {
    getNotes: vi.fn().mockResolvedValue(notes),
    getImages: vi.fn().mockResolvedValue(images),
    getImageData: vi.fn().mockImplementation((id: string) =>
      Promise.resolve(imageData[id] ?? null),
    ),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

describe("migrateLegacyData", () => {
  let db: AppDatabase | null = null;

  afterEach(async () => {
    if (db) {
      await db.close();
      db = null;
    }
  });

  async function makeDb() {
    db = await createAppDatabase(
      `test-migration-${Date.now()}-${Math.random()}`,
      { memory: true },
    );
    return db;
  }

  it("decrypts and migrates encrypted notes into RxDB", async () => {
    const database = await makeDb();
    const notes = [
      encryptedNote("01-01-2024", "Hello world", "2024-01-01T10:00:00Z"),
      encryptedNote("15-06-2024", "Summer note", "2024-06-15T08:30:00Z"),
    ];
    const source = makeMockSource(notes);

    const result = await migrateLegacyData(database, source, makeE2ee());
    expect(result.migratedNotes).toBe(2);
    expect(result.failedNotes).toBe(0);

    const doc1 = await database.notes.findOne("01-01-2024").exec();
    expect(doc1?.content).toBe("Hello world");
    expect(doc1?.updatedAt).toBe("2024-01-01T10:00:00Z");
    expect(doc1?.isDeleted).toBe(false);

    const doc2 = await database.notes.findOne("15-06-2024").exec();
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
    const source = makeMockSource([
      encryptedNote("25-07-2024", "Hot day", "2024-07-25T12:00:00Z", weather),
    ]);

    await migrateLegacyData(database, source, makeE2ee());

    const doc = await database.notes.findOne("25-07-2024").exec();
    expect(doc?.weather).toEqual(weather);
  });

  it("skips already-existing notes (idempotent)", async () => {
    const database = await makeDb();

    await database.notes.insert({
      date: "10-03-2024",
      content: "Existing note",
      updatedAt: "2024-03-10T09:00:00Z",
      isDeleted: false,
    });

    const source = makeMockSource([
      encryptedNote("10-03-2024", "Legacy version", "2024-03-10T08:00:00Z"),
    ]);

    await migrateLegacyData(database, source, makeE2ee());

    const doc = await database.notes.findOne("10-03-2024").exec();
    expect(doc?.content).toBe("Existing note");
  });

  it("counts decryption failures instead of inserting", async () => {
    const database = await makeDb();
    const source = makeMockSource([
      {
        date: "02-02-2024",
        keyId: "missing-key",
        ciphertext: "garbage",
        nonce: "n",
        updatedAt: "2024-02-02T00:00:00Z",
      },
    ]);
    const e2ee = makeE2ee({
      decryptNoteRecord: vi.fn().mockResolvedValue(null),
    });

    const result = await migrateLegacyData(database, source, e2ee);
    expect(result.migratedNotes).toBe(0);
    expect(result.failedNotes).toBe(1);

    const doc = await database.notes.findOne("02-02-2024").exec();
    expect(doc).toBeNull();
  });

  it("calls destroy on legacy source after migration", async () => {
    const database = await makeDb();
    const source = makeMockSource();

    await migrateLegacyData(database, source, makeE2ee());

    expect(source.destroy).toHaveBeenCalledOnce();
  });

  it("decrypts and migrates images as blob attachments", async () => {
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
    const imageData: Record<string, LegacyEncryptedImageData> = {
      "img-001": { keyId: "k1", ciphertext: "fake-png-data", nonce: "n" },
    };
    const source = makeMockSource([], images, imageData);

    const result = await migrateLegacyData(database, source, makeE2ee());
    expect(result.migratedImages).toBe(1);

    const doc = await database.images.findOne("img-001").exec();
    expect(doc?.noteDate).toBe("20-04-2024");
    expect(doc?.filename).toBe("photo.png");
    expect(doc?.isDeleted).toBe(false);
    expect(doc?.getAttachment("blob")).not.toBeNull();
  });

  it("skips already-existing images (idempotent)", async () => {
    const database = await makeDb();

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
    const source = makeMockSource([], images, {
      "img-existing": { ciphertext: "data", nonce: "n" },
    });

    await migrateLegacyData(database, source, makeE2ee());

    const doc = await database.images.findOne("img-existing").exec();
    expect(doc?.filename).toBe("existing.jpg");
  });

  it("counts image failures when image data is missing", async () => {
    const database = await makeDb();
    const images: LegacyImageMeta[] = [
      {
        id: "img-no-data",
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
    const source = makeMockSource([], images, {});

    const result = await migrateLegacyData(database, source, makeE2ee());
    expect(result.migratedImages).toBe(0);
    expect(result.failedImages).toBe(1);

    const doc = await database.images.findOne("img-no-data").exec();
    expect(doc).toBeNull();
  });
});
