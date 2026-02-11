import { createCloudImageRepository } from "../storage/cloudImageStorage";

function createMockSupabase() {
  const storageMethods = {
    upload: jest.fn().mockResolvedValue({ error: null }),
    download: jest.fn().mockResolvedValue({ data: null, error: null }),
    remove: jest.fn().mockResolvedValue({ error: null }),
    createSignedUrl: jest.fn().mockResolvedValue({ data: null, error: null }),
  };

  const fromStorage = jest.fn().mockReturnValue(storageMethods);

  // Chainable query builder
  const createQueryBuilder = (data: unknown = null, error: unknown = null) => {
    const builder: Record<string, jest.Mock> = {};
    const chain = () => builder;
    builder.select = jest.fn().mockImplementation(chain);
    builder.insert = jest.fn().mockImplementation(chain);
    builder.update = jest.fn().mockImplementation(chain);
    builder.delete = jest.fn().mockImplementation(chain);
    builder.upsert = jest.fn().mockImplementation(chain);
    builder.eq = jest.fn().mockImplementation(chain);
    builder.single = jest.fn().mockResolvedValue({ data, error });
    return builder;
  };

  let queryBuilder = createQueryBuilder();

  const fromDb = jest.fn().mockImplementation(() => queryBuilder);

  return {
    supabase: {
      storage: { from: fromStorage },
      from: fromDb,
    } as unknown as Parameters<typeof createCloudImageRepository>[0],
    storageMethods,
    fromStorage,
    fromDb,
    setQueryResult: (data: unknown, error: unknown = null) => {
      queryBuilder = createQueryBuilder(data, error);
      fromDb.mockImplementation(() => queryBuilder);
    },
    createQueryBuilder,
  };
}

describe("cloudImageStorage", () => {
  const userId = "user-123";

  describe("upload", () => {
    it("uploads image to storage and inserts metadata", async () => {
      const { supabase, storageMethods, fromDb } = createMockSupabase();
      const repo = createCloudImageRepository(supabase, userId);
      const blob = new Blob(["image-data"], { type: "image/jpeg" });

      const result = await repo.upload("15-01-2025", blob, "inline", "photo.jpg", {
        width: 800,
        height: 600,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Image stored in Supabase Storage
      expect(storageMethods.upload).toHaveBeenCalledWith(
        expect.stringContaining(`${userId}/`),
        blob,
        { contentType: "image/jpeg", upsert: false },
      );

      // Metadata inserted
      expect(fromDb).toHaveBeenCalledWith("note_images");

      // Returned metadata is correct
      expect(result.value.noteDate).toBe("15-01-2025");
      expect(result.value.type).toBe("inline");
      expect(result.value.filename).toBe("photo.jpg");
      expect(result.value.mimeType).toBe("image/jpeg");
      expect(result.value.width).toBe(800);
      expect(result.value.height).toBe(600);
      expect(result.value.id).toBeTruthy();
    });

    it("returns error when storage upload fails", async () => {
      const { supabase, storageMethods } = createMockSupabase();
      storageMethods.upload.mockResolvedValue({
        error: { message: "Storage full" },
      });
      const repo = createCloudImageRepository(supabase, userId);
      const blob = new Blob(["data"], { type: "image/png" });

      const result = await repo.upload("15-01-2025", blob, "inline", "pic.png");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("IO");
      expect(result.error.message).toContain("Storage full");
    });

    it("cleans up storage on metadata insert failure", async () => {
      const { supabase, storageMethods, fromDb, createQueryBuilder } =
        createMockSupabase();
      storageMethods.upload.mockResolvedValue({ error: null });
      // Make insert() resolve with an error (insert is awaited directly)
      const builder = createQueryBuilder();
      builder.insert = jest
        .fn()
        .mockResolvedValue({ error: { message: "DB error" } });
      fromDb.mockImplementation(() => builder);

      const repo = createCloudImageRepository(supabase, userId);
      const blob = new Blob(["data"], { type: "image/png" });

      const result = await repo.upload("15-01-2025", blob, "inline", "fail.png");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("DB error");
      }
      // Storage file should be cleaned up
      expect(storageMethods.remove).toHaveBeenCalled();
    });

    it("uses correct file extension from MIME type", async () => {
      const { supabase, storageMethods } = createMockSupabase();
      const repo = createCloudImageRepository(supabase, userId);

      await repo.upload(
        "15-01-2025",
        new Blob(["data"], { type: "image/png" }),
        "inline",
        "pic.png",
      );

      const storagePath = storageMethods.upload.mock.calls[0][0] as string;
      expect(storagePath).toMatch(/\.png$/);
    });
  });

  describe("get", () => {
    it("downloads image blob from storage", async () => {
      const { supabase, setQueryResult, storageMethods } = createMockSupabase();
      setQueryResult({ storage_path: "user-123/img.jpg", mime_type: "image/jpeg" });
      const imageBlob = new Blob(["image-data"], { type: "image/jpeg" });
      storageMethods.download.mockResolvedValue({ data: imageBlob, error: null });

      const repo = createCloudImageRepository(supabase, userId);
      const result = await repo.get("img-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(imageBlob);
    });

    it("returns null when metadata not found", async () => {
      const { supabase, setQueryResult } = createMockSupabase();
      setQueryResult(null, { code: "PGRST116" });

      const repo = createCloudImageRepository(supabase, userId);
      const result = await repo.get("missing");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });

    it("returns null when storage download fails", async () => {
      const { supabase, setQueryResult, storageMethods } = createMockSupabase();
      setQueryResult({ storage_path: "user-123/img.jpg", mime_type: "image/jpeg" });
      storageMethods.download.mockResolvedValue({
        data: null,
        error: { message: "Not found" },
      });

      const repo = createCloudImageRepository(supabase, userId);
      const result = await repo.get("img-gone");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });
  });

  describe("getUrl", () => {
    it("returns signed URL for existing image", async () => {
      const { supabase, setQueryResult, storageMethods } = createMockSupabase();
      setQueryResult({ storage_path: "user-123/img.jpg" });
      storageMethods.createSignedUrl.mockResolvedValue({
        data: { signedUrl: "https://storage.example.com/signed?token=abc" },
        error: null,
      });

      const repo = createCloudImageRepository(supabase, userId);
      const result = await repo.getUrl("img-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe("https://storage.example.com/signed?token=abc");
      expect(storageMethods.createSignedUrl).toHaveBeenCalledWith(
        "user-123/img.jpg",
        3600,
      );
    });

    it("returns null when metadata not found", async () => {
      const { supabase, setQueryResult } = createMockSupabase();
      setQueryResult(null, { code: "PGRST116" });

      const repo = createCloudImageRepository(supabase, userId);
      const result = await repo.getUrl("missing");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });
  });

  describe("delete", () => {
    it("deletes from storage and metadata table", async () => {
      const { supabase, setQueryResult, storageMethods, fromDb } =
        createMockSupabase();
      setQueryResult({ storage_path: "user-123/img.jpg" });

      const repo = createCloudImageRepository(supabase, userId);
      const result = await repo.delete("img-del");

      expect(result.ok).toBe(true);
      expect(storageMethods.remove).toHaveBeenCalledWith(["user-123/img.jpg"]);
      expect(fromDb).toHaveBeenCalledWith("note_images");
    });

    it("returns ok when image already deleted", async () => {
      const { supabase, setQueryResult } = createMockSupabase();
      setQueryResult(null, { code: "PGRST116" });

      const repo = createCloudImageRepository(supabase, userId);
      const result = await repo.delete("already-gone");

      expect(result.ok).toBe(true);
    });
  });

  describe("getByNoteDate", () => {
    it("returns mapped image metadata for a date", async () => {
      const { supabase, fromDb, createQueryBuilder } = createMockSupabase();
      const rows = [
        {
          id: "img-1",
          note_date: "15-01-2025",
          type: "inline",
          filename: "a.jpg",
          mime_type: "image/jpeg",
          width: 100,
          height: 200,
          size: 5000,
          created_at: "2025-01-15T10:00:00Z",
        },
      ];
      // For getByNoteDate, the chain ends without .single()
      const builder = createQueryBuilder();
      // Override so the eq chain returns data directly (no .single call)
      builder.eq = jest.fn().mockImplementation(() => ({
        ...builder,
        eq: jest.fn().mockResolvedValue({ data: rows, error: null }),
      }));
      fromDb.mockImplementation(() => builder);

      const repo = createCloudImageRepository(supabase, userId);
      const result = await repo.getByNoteDate("15-01-2025");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({
        id: "img-1",
        noteDate: "15-01-2025",
        type: "inline",
        filename: "a.jpg",
        mimeType: "image/jpeg",
      });
    });

    it("returns empty array when no images for date", async () => {
      const { supabase, fromDb, createQueryBuilder } = createMockSupabase();
      const builder = createQueryBuilder();
      builder.eq = jest.fn().mockImplementation(() => ({
        ...builder,
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      }));
      fromDb.mockImplementation(() => builder);

      const repo = createCloudImageRepository(supabase, userId);
      const result = await repo.getByNoteDate("01-01-2030");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });
  });
});
