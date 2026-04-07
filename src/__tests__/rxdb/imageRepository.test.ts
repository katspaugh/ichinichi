import { describe, it, expect, afterEach } from "vitest";
import { createAppDatabase, type AppDatabase } from "../../storage/rxdb/database";
import { RxDBImageRepository } from "../../storage/rxdb/imageRepository";

describe("RxDBImageRepository", () => {
  let db: AppDatabase | null = null;

  afterEach(async () => {
    if (db) {
      await db.close();
      db = null;
    }
  });

  async function makeRepo() {
    db = await createAppDatabase(`test-images-${Date.now()}-${Math.random()}`, { memory: true });
    return new RxDBImageRepository(db);
  }

  function makeBlob(content = "fake-image-data", mimeType = "image/png"): Blob {
    return new Blob([content], { type: mimeType });
  }

  it("uploads and retrieves an image", async () => {
    const repo = await makeRepo();
    const blob = makeBlob("png-data", "image/png");

    const uploadResult = await repo.upload("15-06-2024", blob, "inline", "photo.png", {
      width: 800,
      height: 600,
    });

    expect(uploadResult.ok).toBe(true);
    if (!uploadResult.ok) return;

    const meta = uploadResult.value;
    expect(meta.noteDate).toBe("15-06-2024");
    expect(meta.type).toBe("inline");
    expect(meta.filename).toBe("photo.png");
    expect(meta.mimeType).toBe("image/png");
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
    expect(meta.size).toBe(blob.size);
    expect(meta.id).toBeTruthy();

    const getResult = await repo.get(meta.id);
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;

    expect(getResult.value).not.toBeNull();
    const retrievedBlob = getResult.value!;
    expect(retrievedBlob.size).toBe(blob.size);
  });

  it("returns null for a non-existent image", async () => {
    const repo = await makeRepo();
    const result = await repo.get("non-existent-id");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it("gets images by note date", async () => {
    const repo = await makeRepo();

    await repo.upload("20-03-2024", makeBlob("img1"), "background", "bg.jpg", { width: 1920, height: 1080 });
    await repo.upload("20-03-2024", makeBlob("img2"), "inline", "inline.jpg", { width: 400, height: 300 });
    await repo.upload("21-03-2024", makeBlob("img3"), "inline", "other.jpg", { width: 100, height: 100 });

    const result = await repo.getByNoteDate("20-03-2024");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(2);
    const filenames = result.value.map((img) => img.filename);
    expect(filenames).toContain("bg.jpg");
    expect(filenames).toContain("inline.jpg");
    expect(filenames).not.toContain("other.jpg");
  });

  it("soft-deletes an image", async () => {
    const repo = await makeRepo();
    const blob = makeBlob("data");

    const uploadResult = await repo.upload("10-01-2024", blob, "inline", "to-delete.png");
    expect(uploadResult.ok).toBe(true);
    if (!uploadResult.ok) return;

    const imageId = uploadResult.value.id;

    const deleteResult = await repo.delete(imageId);
    expect(deleteResult.ok).toBe(true);

    // get should return null after soft-delete
    const getResult = await repo.get(imageId);
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value).toBeNull();
    }

    // getByNoteDate should not include deleted images
    const listResult = await repo.getByNoteDate("10-01-2024");
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value).toHaveLength(0);
    }
  });

  it("deletes all images for a note date", async () => {
    const repo = await makeRepo();

    const r1 = await repo.upload("05-05-2024", makeBlob("a"), "inline", "a.jpg");
    const r2 = await repo.upload("05-05-2024", makeBlob("b"), "background", "b.jpg");
    expect(r1.ok && r2.ok).toBe(true);

    const deleteResult = await repo.deleteByNoteDate("05-05-2024");
    expect(deleteResult.ok).toBe(true);

    const listResult = await repo.getByNoteDate("05-05-2024");
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value).toHaveLength(0);
    }
  });

  it("getUrl returns null for local-only repo", async () => {
    const repo = await makeRepo();
    const result = await repo.getUrl("any-id");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });
});
