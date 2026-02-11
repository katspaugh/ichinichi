import { syncEncryptedImages } from "../storage/unifiedImageSyncService";
import * as imageStore from "../storage/unifiedImageStore";
import * as envelopeRepo from "../storage/unifiedImageEnvelopeRepository";
import type { ImageEnvelopeState } from "../storage/unifiedImageEnvelopeRepository";
import type { ImageMetaRecord, ImageRecord } from "../storage/unifiedDb";

// Mock the store and envelope repository modules
jest.mock("../storage/unifiedImageStore");
jest.mock("../storage/unifiedImageEnvelopeRepository");

const mockedStore = imageStore as jest.Mocked<typeof imageStore>;
const mockedEnvelope = envelopeRepo as jest.Mocked<typeof envelopeRepo>;

function makeMeta(
  id: string,
  overrides?: Partial<ImageMetaRecord>,
): ImageMetaRecord {
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
    sha256: "abc123def456",
    keyId: "key-1",
    pendingOp: null,
    ...overrides,
  };
}

function makeRecord(id: string): ImageRecord {
  return {
    version: 1,
    id,
    keyId: "key-1",
    ciphertext: "Y2lwaGVydGV4dA==",
    nonce: "bm9uY2U=",
  };
}

function makeEnvelopeState(overrides: {
  meta: ImageMetaRecord | null;
  record?: ImageRecord | null;
}): ImageEnvelopeState {
  const meta = overrides.meta;
  const record = overrides.record ?? (meta ? makeRecord(meta.id) : null);
  return {
    envelope:
      meta && record
        ? {
            id: meta.id,
            noteDate: meta.noteDate,
            type: meta.type,
            filename: meta.filename,
            mimeType: meta.mimeType,
            width: meta.width,
            height: meta.height,
            size: meta.size,
            createdAt: meta.createdAt,
            sha256: meta.sha256,
            ciphertext: record.ciphertext,
            nonce: record.nonce,
            keyId: record.keyId,
            serverUpdatedAt: null,
            deleted: false,
            remotePath: null,
          }
        : null,
    record,
    meta,
  };
}

function createMockSupabase() {
  const storageMethods = {
    upload: jest.fn().mockResolvedValue({ error: null }),
    remove: jest.fn().mockResolvedValue({ error: null }),
  };

  const builder: Record<string, jest.Mock> = {};
  const chain = () => builder;
  builder.upsert = jest.fn().mockImplementation(chain);
  builder.update = jest.fn().mockImplementation(chain);
  builder.select = jest.fn().mockImplementation(chain);
  builder.eq = jest.fn().mockImplementation(chain);
  builder.single = jest.fn().mockResolvedValue({
    data: { server_updated_at: "2025-01-15T12:00:00Z" },
    error: null,
  });

  return {
    supabase: {
      storage: { from: jest.fn().mockReturnValue(storageMethods) },
      from: jest.fn().mockReturnValue(builder),
    } as unknown as Parameters<typeof syncEncryptedImages>[0],
    storageMethods,
    builder,
  };
}

describe("syncEncryptedImages", () => {
  const userId = "user-123";

  beforeEach(() => {
    jest.clearAllMocks();
    mockedStore.storeImageAndMeta.mockResolvedValue(undefined);
    mockedStore.deleteImageRecords.mockResolvedValue(undefined);
  });

  it("skips images with no pending operation", async () => {
    const state = makeEnvelopeState({
      meta: makeMeta("img-1", { pendingOp: null }),
    });
    mockedEnvelope.getAllImageEnvelopeStates.mockResolvedValue([state]);
    const { supabase, storageMethods } = createMockSupabase();

    await syncEncryptedImages(supabase, userId);

    expect(storageMethods.upload).not.toHaveBeenCalled();
    expect(storageMethods.remove).not.toHaveBeenCalled();
    expect(mockedStore.deleteImageRecords).not.toHaveBeenCalled();
  });

  it("uploads pending images to cloud storage", async () => {
    const meta = makeMeta("img-up", { pendingOp: "upload" });
    const record = makeRecord("img-up");
    const state = makeEnvelopeState({ meta, record });
    mockedEnvelope.getAllImageEnvelopeStates.mockResolvedValue([state]);
    const { supabase, storageMethods } = createMockSupabase();

    await syncEncryptedImages(supabase, userId);

    expect(storageMethods.upload).toHaveBeenCalledWith(
      `${userId}/15-01-2025/img-up.enc`,
      expect.any(Blob),
      { upsert: true, contentType: "application/octet-stream" },
    );
  });

  it("stores updated metadata with remotePath after upload", async () => {
    const meta = makeMeta("img-up2", { pendingOp: "upload" });
    const record = makeRecord("img-up2");
    const state = makeEnvelopeState({ meta, record });
    mockedEnvelope.getAllImageEnvelopeStates.mockResolvedValue([state]);
    const { supabase } = createMockSupabase();

    await syncEncryptedImages(supabase, userId);

    expect(mockedStore.storeImageAndMeta).toHaveBeenCalledWith(
      record,
      expect.objectContaining({
        id: "img-up2",
        remotePath: `${userId}/15-01-2025/img-up2.enc`,
        serverUpdatedAt: "2025-01-15T12:00:00Z",
        pendingOp: null,
      }),
    );
  });

  it("deletes image from cloud storage and local DB", async () => {
    const meta = makeMeta("img-del", {
      pendingOp: "delete",
      remotePath: "user-123/15-01-2025/img-del.enc",
    });
    const state = makeEnvelopeState({ meta, record: null });
    mockedEnvelope.getAllImageEnvelopeStates.mockResolvedValue([state]);
    const { supabase, storageMethods } = createMockSupabase();

    await syncEncryptedImages(supabase, userId);

    // Removed from cloud storage
    expect(storageMethods.remove).toHaveBeenCalledWith([
      "user-123/15-01-2025/img-del.enc",
    ]);
    // Soft-deleted in DB
    expect(supabase.from).toHaveBeenCalledWith("note_images");
    // Local records cleaned up
    expect(mockedStore.deleteImageRecords).toHaveBeenCalledWith("img-del");
  });

  it("skips cloud storage removal for delete without remotePath", async () => {
    const meta = makeMeta("img-local-del", {
      pendingOp: "delete",
      remotePath: null,
    });
    const state = makeEnvelopeState({ meta, record: null });
    mockedEnvelope.getAllImageEnvelopeStates.mockResolvedValue([state]);
    const { supabase, storageMethods } = createMockSupabase();

    await syncEncryptedImages(supabase, userId);

    expect(storageMethods.remove).not.toHaveBeenCalled();
    // Still deletes local records and marks remote as deleted
    expect(mockedStore.deleteImageRecords).toHaveBeenCalledWith("img-local-del");
  });

  it("processes multiple images in sequence", async () => {
    const states = [
      makeEnvelopeState({
        meta: makeMeta("img-a", { pendingOp: "upload" }),
      }),
      makeEnvelopeState({
        meta: makeMeta("img-b", {
          pendingOp: "delete",
          remotePath: "user-123/path.enc",
        }),
        record: null,
      }),
      makeEnvelopeState({
        meta: makeMeta("img-c", { pendingOp: null }),
      }),
    ];
    mockedEnvelope.getAllImageEnvelopeStates.mockResolvedValue(states);
    const { supabase, storageMethods } = createMockSupabase();

    await syncEncryptedImages(supabase, userId);

    // img-a uploaded
    expect(storageMethods.upload).toHaveBeenCalledTimes(1);
    // img-b deleted from storage
    expect(storageMethods.remove).toHaveBeenCalledTimes(1);
    // img-c skipped
    expect(mockedStore.storeImageAndMeta).toHaveBeenCalledTimes(1);
    expect(mockedStore.deleteImageRecords).toHaveBeenCalledTimes(1);
  });

  it("throws when upload fails", async () => {
    const meta = makeMeta("img-fail", { pendingOp: "upload" });
    const state = makeEnvelopeState({ meta });
    mockedEnvelope.getAllImageEnvelopeStates.mockResolvedValue([state]);
    const { supabase, storageMethods } = createMockSupabase();
    storageMethods.upload.mockResolvedValue({
      error: { message: "Quota exceeded" },
    });

    await expect(syncEncryptedImages(supabase, userId)).rejects.toMatchObject({
      message: "Quota exceeded",
    });
  });

  it("skips upload when no envelope exists for pending meta", async () => {
    const meta = makeMeta("img-no-env", { pendingOp: "upload" });
    const state: ImageEnvelopeState = {
      envelope: null,
      record: null,
      meta,
    };
    mockedEnvelope.getAllImageEnvelopeStates.mockResolvedValue([state]);
    const { supabase, storageMethods } = createMockSupabase();

    await syncEncryptedImages(supabase, userId);

    expect(storageMethods.upload).not.toHaveBeenCalled();
    expect(mockedStore.storeImageAndMeta).not.toHaveBeenCalled();
  });
});
