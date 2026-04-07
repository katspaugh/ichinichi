import { describe, it, expect } from "vitest";
import {
  createImagePushModifier,
  createImagePullModifier,
} from "../../storage/rxdb/replication";
import type { ImageReplicationCrypto, StorageBucket } from "../../storage/rxdb/replication";
import type { ImageDocType } from "../../storage/rxdb/schemas";

// ---------------------------------------------------------------------------
// In-memory mock bucket
// ---------------------------------------------------------------------------

function makeMockBucket(): StorageBucket {
  const store = new Map<string, Blob>();
  return {
    async upload(path, blob) {
      store.set(path, blob);
      return { ok: true, value: path };
    },
    async download(path) {
      const blob = store.get(path);
      if (!blob) {
        return { ok: false, error: `Not found: ${path}` };
      }
      return { ok: true, value: blob };
    },
  };
}

// ---------------------------------------------------------------------------
// Mock crypto: encodes blob text as base64, wraps in a JSON record
// ---------------------------------------------------------------------------

function makeMockCrypto(): ImageReplicationCrypto {
  return {
    async encryptBlob(blob) {
      const text = await blob.text();
      const ciphertext = btoa(text);
      return {
        ok: true,
        value: {
          record: {
            version: 1 as const,
            id: "enc-id",
            keyId: "mock-key",
            ciphertext,
            nonce: "mock-nonce",
          },
          sha256: "mock-sha256",
          size: blob.size,
          keyId: "mock-key",
        },
      };
    },
    async decryptBlob(record, mimeType) {
      try {
        const text = atob(record.ciphertext);
        return { ok: true, value: new Blob([text], { type: mimeType }) };
      } catch {
        return { ok: false, error: { type: "DecryptFailed", message: "bad ciphertext" } };
      }
    },
  };
}

function makeFailingCrypto(): ImageReplicationCrypto {
  return {
    async encryptBlob() {
      return { ok: false, error: { type: "EncryptFailed", message: "no key" } };
    },
    async decryptBlob() {
      return { ok: false, error: { type: "DecryptFailed", message: "no key" } };
    },
  };
}

// ---------------------------------------------------------------------------
// Sample ImageDocType
// ---------------------------------------------------------------------------

function makeImageDoc(overrides: Partial<ImageDocType> = {}): ImageDocType {
  return {
    id: "img-001",
    noteDate: "15-06-2024",
    type: "inline",
    filename: "photo.png",
    mimeType: "image/png",
    width: 800,
    height: 600,
    size: 42,
    createdAt: "2024-06-15T10:00:00.000Z",
    isDeleted: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Push modifier tests
// ---------------------------------------------------------------------------

describe("createImagePushModifier", () => {
  it("encrypts the blob and uploads to bucket, returning a Supabase row", async () => {
    const crypto = makeMockCrypto();
    const bucket = makeMockBucket();
    const userId = "user-42";
    const push = createImagePushModifier(crypto, bucket, userId);

    const doc = makeImageDoc();
    const blob = new Blob(["fake-image"], { type: "image/png" });

    const row = await push(doc, blob);

    expect(row.id).toBe("img-001");
    expect(row.noteDate).toBe("15-06-2024");
    expect(row.type).toBe("inline");
    expect(row.filename).toBe("photo.png");
    expect(row.mimeType).toBe("image/png");
    expect(row.width).toBe(800);
    expect(row.height).toBe(600);
    expect(row.key_id).toBe("mock-key");
    expect(row.nonce).toBe("mock-nonce");
    expect(row.sha256).toBe("mock-sha256");
    expect(row.isDeleted).toBe(false);
    expect(row._deleted).toBe(false);
    expect(row._modified).toBeDefined();
  });

  it("uploads ciphertext to bucket at {userId}/{imageId} path", async () => {
    const crypto = makeMockCrypto();
    const uploads: Array<{ path: string; blob: Blob }> = [];
    const bucket: StorageBucket = {
      async upload(path, blob) {
        uploads.push({ path, blob });
        return { ok: true, value: path };
      },
      async download() {
        return { ok: false, error: "not used" };
      },
    };

    const push = createImagePushModifier(crypto, bucket, "user-99");
    const doc = makeImageDoc({ id: "img-xyz" });
    const blob = new Blob(["data"], { type: "image/png" });

    await push(doc, blob);

    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toBe("user-99/img-xyz");
  });

  it("uploads an encrypted blob (ciphertext), not the original blob", async () => {
    const crypto = makeMockCrypto();
    const uploadedBlobs: Blob[] = [];
    const bucket: StorageBucket = {
      async upload(_path, blob) {
        uploadedBlobs.push(blob);
        return { ok: true, value: _path };
      },
      async download() {
        return { ok: false, error: "not used" };
      },
    };

    const push = createImagePushModifier(crypto, bucket, "user-1");
    const originalContent = "original-image-data";
    const doc = makeImageDoc();
    const blob = new Blob([originalContent], { type: "image/png" });

    await push(doc, blob);

    expect(uploadedBlobs).toHaveLength(1);
    const uploadedText = await uploadedBlobs[0].text();
    // The uploaded content should be a JSON-serialised encrypted record, not raw image bytes
    expect(uploadedText).not.toBe(originalContent);
  });

  it("throws when encryption fails", async () => {
    const crypto = makeFailingCrypto();
    const bucket = makeMockBucket();
    const push = createImagePushModifier(crypto, bucket, "user-1");

    const doc = makeImageDoc();
    const blob = new Blob(["data"]);

    await expect(push(doc, blob)).rejects.toThrow();
  });

  it("throws when bucket upload fails", async () => {
    const crypto = makeMockCrypto();
    const failingBucket: StorageBucket = {
      async upload() {
        return { ok: false, error: "storage unavailable" };
      },
      async download() {
        return { ok: false, error: "not used" };
      },
    };

    const push = createImagePushModifier(crypto, failingBucket, "user-1");
    const doc = makeImageDoc();
    const blob = new Blob(["data"]);

    await expect(push(doc, blob)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Pull modifier tests
// ---------------------------------------------------------------------------

// A Supabase image row shape used in tests
interface SupabaseImageRow {
  id: string;
  noteDate: string;
  type: "background" | "inline";
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
  key_id: string;
  nonce: string;
  sha256: string;
  _modified: string;
  _deleted: boolean;
  isDeleted: boolean;
}

describe("createImagePullModifier", () => {
  it("downloads and decrypts blob, returning doc and blob", async () => {
    const crypto = makeMockCrypto();
    const bucket = makeMockBucket();
    const userId = "user-42";

    // Pre-populate the bucket with a JSON-serialised encrypted record, mirroring
    // what the push modifier stores: JSON({ version, id, keyId, ciphertext, nonce })
    // The mock crypto encryptBlob sets ciphertext = btoa(text), so to round-trip
    // "decrypted-image-bytes" we need ciphertext = btoa("decrypted-image-bytes").
    const originalContent = "decrypted-image-bytes";
    const storedRecord = {
      version: 1,
      id: "enc-id",
      keyId: "mock-key",
      ciphertext: btoa(originalContent),
      nonce: "mock-nonce",
    };
    await bucket.upload(
      "user-42/img-001",
      new Blob([JSON.stringify(storedRecord)], { type: "application/octet-stream" }),
    );

    const pull = createImagePullModifier(crypto, bucket, userId);

    const row: SupabaseImageRow = {
      id: "img-001",
      noteDate: "15-06-2024",
      type: "inline",
      filename: "photo.png",
      mimeType: "image/png",
      width: 800,
      height: 600,
      size: 42,
      createdAt: "2024-06-15T10:00:00.000Z",
      key_id: "mock-key",
      nonce: "mock-nonce",
      sha256: "mock-sha256",
      _modified: "2024-06-15T10:00:00.000Z",
      _deleted: false,
      isDeleted: false,
    };

    const result = await pull(row);

    expect(result.doc.id).toBe("img-001");
    expect(result.doc.noteDate).toBe("15-06-2024");
    expect(result.doc.type).toBe("inline");
    expect(result.doc.filename).toBe("photo.png");
    expect(result.doc.mimeType).toBe("image/png");
    expect(result.doc.width).toBe(800);
    expect(result.doc.height).toBe(600);
    expect(result.doc.isDeleted).toBe(false);

    expect(result.blob).not.toBeNull();
    const blobText = await result.blob!.text();
    expect(blobText).toBe(originalContent);
  });

  it("returns doc with isDeleted true and null blob when _deleted is true", async () => {
    const crypto = makeMockCrypto();
    const bucket = makeMockBucket();
    const pull = createImagePullModifier(crypto, bucket, "user-1");

    const row: SupabaseImageRow = {
      id: "img-del",
      noteDate: "01-01-2024",
      type: "background",
      filename: "old.jpg",
      mimeType: "image/jpeg",
      width: 100,
      height: 100,
      size: 10,
      createdAt: "2024-01-01T00:00:00.000Z",
      key_id: "k",
      nonce: "n",
      sha256: "s",
      _modified: "2024-01-01T00:00:00.000Z",
      _deleted: true,
      isDeleted: true,
    };

    const result = await pull(row);

    expect(result.doc.isDeleted).toBe(true);
    expect(result.blob).toBeNull();
  });

  it("returns null blob when bucket download fails, doc still maps correctly", async () => {
    const crypto = makeMockCrypto();
    const emptyBucket: StorageBucket = {
      async upload() { return { ok: true, value: "" }; },
      async download() { return { ok: false, error: "not found" }; },
    };
    const pull = createImagePullModifier(crypto, emptyBucket, "user-1");

    const row: SupabaseImageRow = {
      id: "img-missing",
      noteDate: "02-02-2024",
      type: "inline",
      filename: "gone.png",
      mimeType: "image/png",
      width: 50,
      height: 50,
      size: 5,
      createdAt: "2024-02-02T00:00:00.000Z",
      key_id: "k",
      nonce: "n",
      sha256: "s",
      _modified: "2024-02-02T00:00:00.000Z",
      _deleted: false,
      isDeleted: false,
    };

    const result = await pull(row);

    expect(result.doc.id).toBe("img-missing");
    expect(result.blob).toBeNull();
  });

  it("returns null blob when decryption fails, doc still maps correctly", async () => {
    const failingCrypto = makeFailingCrypto();
    const bucket = makeMockBucket();
    // Put something in the bucket so download succeeds
    await bucket.upload("user-1/img-badenc", new Blob(["garbage"]));

    const pull = createImagePullModifier(failingCrypto, bucket, "user-1");

    const row: SupabaseImageRow = {
      id: "img-badenc",
      noteDate: "03-03-2024",
      type: "inline",
      filename: "bad.png",
      mimeType: "image/png",
      width: 10,
      height: 10,
      size: 7,
      createdAt: "2024-03-03T00:00:00.000Z",
      key_id: "k",
      nonce: "n",
      sha256: "s",
      _modified: "2024-03-03T00:00:00.000Z",
      _deleted: false,
      isDeleted: false,
    };

    const result = await pull(row);

    expect(result.doc.id).toBe("img-badenc");
    expect(result.blob).toBeNull();
  });
});
