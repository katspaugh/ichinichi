import {
  storeImageAndMeta,
  getImageRecord,
  getImageMeta,
  getAllImageMeta,
  getMetaByDate,
  deleteImageRecords,
  deleteImageRecord,
  setImageMeta,
  deleteImagesByDate,
  clearImageSyncMetadata,
} from "../storage/unifiedImageStore";
import { closeUnifiedDb } from "../storage/unifiedDb";
import type { ImageRecord, ImageMetaRecord } from "../storage/unifiedDb";
import { getAllAccountDbNames } from "../storage/accountStore";

async function deleteUnifiedDb(): Promise<void> {
  closeUnifiedDb();
  const dbNames = getAllAccountDbNames();
  await Promise.all(
    dbNames.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => resolve();
        }),
    ),
  );
}

function makeRecord(id: string, overrides?: Partial<ImageRecord>): ImageRecord {
  return {
    version: 1,
    id,
    keyId: "key-1",
    ciphertext: "Y2lwaGVydGV4dA==",
    nonce: "bm9uY2U=",
    ...overrides,
  };
}

function makeMeta(id: string, overrides?: Partial<ImageMetaRecord>): ImageMetaRecord {
  return {
    id,
    noteDate: "15-01-2025",
    type: "inline",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    width: 800,
    height: 600,
    size: 1024,
    createdAt: "2025-01-15T10:00:00Z",
    sha256: "abc123",
    keyId: "key-1",
    ...overrides,
  };
}

describe("unifiedImageStore", () => {
  beforeEach(async () => {
    await deleteUnifiedDb();
  });

  describe("storeImageAndMeta", () => {
    it("stores both image record and metadata atomically", async () => {
      const record = makeRecord("img-1");
      const meta = makeMeta("img-1");

      await storeImageAndMeta(record, meta);

      const storedRecord = await getImageRecord("img-1");
      const storedMeta = await getImageMeta("img-1");

      expect(storedRecord).toEqual(record);
      expect(storedMeta).toEqual(meta);
    });

    it("overwrites existing records on put", async () => {
      const record = makeRecord("img-1");
      const meta = makeMeta("img-1");
      await storeImageAndMeta(record, meta);

      const updated = makeMeta("img-1", { filename: "updated.png" });
      await storeImageAndMeta(record, updated);

      const storedMeta = await getImageMeta("img-1");
      expect(storedMeta?.filename).toBe("updated.png");
    });
  });

  describe("getImageRecord / getImageMeta", () => {
    it("returns null for non-existent image", async () => {
      const record = await getImageRecord("nonexistent");
      const meta = await getImageMeta("nonexistent");

      expect(record).toBeNull();
      expect(meta).toBeNull();
    });
  });

  describe("getAllImageMeta", () => {
    it("returns empty array when no images exist", async () => {
      const metas = await getAllImageMeta();
      expect(metas).toEqual([]);
    });

    it("returns all stored metadata", async () => {
      await storeImageAndMeta(makeRecord("img-1"), makeMeta("img-1"));
      await storeImageAndMeta(
        makeRecord("img-2"),
        makeMeta("img-2", { noteDate: "16-01-2025" }),
      );

      const metas = await getAllImageMeta();
      expect(metas).toHaveLength(2);
      const ids = metas.map((m) => m.id).sort();
      expect(ids).toEqual(["img-1", "img-2"]);
    });
  });

  describe("getMetaByDate", () => {
    it("returns only images matching the date", async () => {
      await storeImageAndMeta(
        makeRecord("img-a"),
        makeMeta("img-a", { noteDate: "15-01-2025" }),
      );
      await storeImageAndMeta(
        makeRecord("img-b"),
        makeMeta("img-b", { noteDate: "15-01-2025" }),
      );
      await storeImageAndMeta(
        makeRecord("img-c"),
        makeMeta("img-c", { noteDate: "16-01-2025" }),
      );

      const jan15 = await getMetaByDate("15-01-2025");
      const jan16 = await getMetaByDate("16-01-2025");

      expect(jan15).toHaveLength(2);
      expect(jan16).toHaveLength(1);
      expect(jan16[0].id).toBe("img-c");
    });

    it("returns empty array for date with no images", async () => {
      const metas = await getMetaByDate("01-01-2030");
      expect(metas).toEqual([]);
    });
  });

  describe("deleteImageRecords", () => {
    it("deletes both image record and metadata", async () => {
      await storeImageAndMeta(makeRecord("img-del"), makeMeta("img-del"));

      await deleteImageRecords("img-del");

      expect(await getImageRecord("img-del")).toBeNull();
      expect(await getImageMeta("img-del")).toBeNull();
    });

    it("does not throw when deleting non-existent image", async () => {
      await expect(deleteImageRecords("nonexistent")).resolves.toBeUndefined();
    });
  });

  describe("deleteImageRecord (blob only)", () => {
    it("deletes image record but preserves metadata", async () => {
      await storeImageAndMeta(makeRecord("img-partial"), makeMeta("img-partial"));

      await deleteImageRecord("img-partial");

      expect(await getImageRecord("img-partial")).toBeNull();
      expect(await getImageMeta("img-partial")).not.toBeNull();
    });
  });

  describe("setImageMeta", () => {
    it("creates metadata if not present", async () => {
      const meta = makeMeta("img-new", { pendingOp: "upload" });
      await setImageMeta(meta);

      const stored = await getImageMeta("img-new");
      expect(stored).toEqual(meta);
    });

    it("updates existing metadata", async () => {
      await storeImageAndMeta(makeRecord("img-up"), makeMeta("img-up"));

      await setImageMeta(
        makeMeta("img-up", { pendingOp: "delete", remotePath: "/path" }),
      );

      const stored = await getImageMeta("img-up");
      expect(stored?.pendingOp).toBe("delete");
      expect(stored?.remotePath).toBe("/path");
    });
  });

  describe("deleteImagesByDate", () => {
    it("deletes all images and metadata for a date", async () => {
      await storeImageAndMeta(
        makeRecord("img-d1"),
        makeMeta("img-d1", { noteDate: "20-01-2025" }),
      );
      await storeImageAndMeta(
        makeRecord("img-d2"),
        makeMeta("img-d2", { noteDate: "20-01-2025" }),
      );
      await storeImageAndMeta(
        makeRecord("img-d3"),
        makeMeta("img-d3", { noteDate: "21-01-2025" }),
      );

      await deleteImagesByDate("20-01-2025");

      expect(await getImageRecord("img-d1")).toBeNull();
      expect(await getImageMeta("img-d1")).toBeNull();
      expect(await getImageRecord("img-d2")).toBeNull();
      expect(await getImageMeta("img-d2")).toBeNull();
      // Other date untouched
      expect(await getImageRecord("img-d3")).not.toBeNull();
    });
  });

  describe("clearImageSyncMetadata", () => {
    it("resets remotePath, serverUpdatedAt, and pendingOp on all images", async () => {
      await storeImageAndMeta(
        makeRecord("img-s1"),
        makeMeta("img-s1", {
          remotePath: "/old/path",
          serverUpdatedAt: "2025-01-15T12:00:00Z",
          pendingOp: "upload",
        }),
      );
      await storeImageAndMeta(
        makeRecord("img-s2"),
        makeMeta("img-s2", {
          remotePath: "/another/path",
          pendingOp: "delete",
        }),
      );

      await clearImageSyncMetadata();

      const meta1 = await getImageMeta("img-s1");
      const meta2 = await getImageMeta("img-s2");

      expect(meta1?.remotePath).toBeNull();
      expect(meta1?.serverUpdatedAt).toBeNull();
      expect(meta1?.pendingOp).toBeNull();
      // Non-sync fields preserved
      expect(meta1?.filename).toBe("photo.jpg");

      expect(meta2?.remotePath).toBeNull();
      expect(meta2?.pendingOp).toBeNull();
    });
  });
});
