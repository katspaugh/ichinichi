import { describe, it, expect } from "vitest";
import { createPushModifier, createPullModifier } from "../../storage/rxdb/replication";
import type { ReplicationCrypto } from "../../storage/rxdb/replication";
import type { NoteDocType } from "../../storage/rxdb/schemas";

// Mock crypto: encodes payload as base64 JSON, decodes back.
// nonce is always "mocknonce", keyId is "mockkey".
const mockCrypto: ReplicationCrypto = {
  async encrypt(payload) {
    const ciphertext = btoa(JSON.stringify(payload));
    return { ok: true, value: { ciphertext, nonce: "mocknonce", keyId: "mockkey" } };
  },
  async decrypt(record) {
    try {
      const payload = JSON.parse(atob(record.ciphertext));
      return { ok: true, value: payload };
    } catch {
      return { ok: false, error: { type: "DecryptFailed", message: "Bad ciphertext" } };
    }
  },
};

const failingCrypto: ReplicationCrypto = {
  async encrypt() {
    return { ok: false, error: { type: "EncryptFailed", message: "no key" } };
  },
  async decrypt() {
    return { ok: false, error: { type: "DecryptFailed", message: "no key" } };
  },
};

describe("createPushModifier", () => {
  it("encrypts note content and returns correct Supabase row shape", async () => {
    const push = createPushModifier(mockCrypto);
    const note: NoteDocType = {
      date: "01-01-2024",
      content: "<p>Hello</p>",
      updatedAt: "2024-01-01T00:00:00.000Z",
      isDeleted: false,
      weather: null,
    };

    const row = await push(note);

    expect(row.date).toBe("01-01-2024");
    expect(row.isDeleted).toBe(false);
    expect(row._deleted).toBe(false);
    expect(row.key_id).toBe("mockkey");
    expect(row.nonce).toBe("mocknonce");
    expect(row.updatedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(row._modified).toBeDefined();
    // ciphertext should decode back to the original payload
    const decoded = JSON.parse(atob(row.content));
    expect(decoded.content).toBe("<p>Hello</p>");
    expect(decoded.weather).toBeNull();
    // content holds the encrypted ciphertext, not the original plaintext
    expect(row.content).not.toBe("<p>Hello</p>");
    expect(row).toHaveProperty("weather");
  });

  it("maps isDeleted to isDeleted", async () => {
    const push = createPushModifier(mockCrypto);
    const note: NoteDocType = {
      date: "02-01-2024",
      content: "",
      updatedAt: "2024-01-02T00:00:00.000Z",
      isDeleted: true,
    };

    const row = await push(note);
    expect(row.isDeleted).toBe(true);
    expect(row._deleted).toBe(true);
  });

  it("throws when encryption fails", async () => {
    const push = createPushModifier(failingCrypto);
    const note: NoteDocType = {
      date: "03-01-2024",
      content: "secret",
      updatedAt: "2024-01-03T00:00:00.000Z",
      isDeleted: false,
    };

    await expect(push(note)).rejects.toThrow();
  });
});

describe("createPullModifier", () => {
  it("decrypts Supabase row and returns correct NoteDocType", async () => {
    const pull = createPullModifier(mockCrypto);
    const payload = { content: "<p>World</p>", weather: null };
    const row = {
      date: "01-01-2024",
      content: btoa(JSON.stringify(payload)),
      nonce: "mocknonce",
      key_id: "mockkey",
      updatedAt: "2024-01-01T00:00:00.000Z",
      _modified: "2024-01-01T00:00:00.000Z",
      isDeleted: false,
    };

    const note = await pull(row);

    expect(note.date).toBe("01-01-2024");
    expect(note.content).toBe("<p>World</p>");
    expect(note.weather).toBeNull();
    expect(note.updatedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(note.isDeleted).toBe(false);
  });

  it("returns empty content with isDeleted true when isDeleted is true", async () => {
    const pull = createPullModifier(mockCrypto);
    const row = {
      date: "02-01-2024",
      content: "does-not-matter",
      nonce: "n",
      key_id: "k",
      updatedAt: "2024-01-02T00:00:00.000Z",
      _modified: "2024-01-02T00:00:00.000Z",
      isDeleted: true,
    };

    const note = await pull(row);

    expect(note.isDeleted).toBe(true);
    expect(note.content).toBe("");
    expect(note.date).toBe("02-01-2024");
  });

  it("returns empty content and logs error when decryption fails", async () => {
    const pull = createPullModifier(failingCrypto);
    const row = {
      date: "03-01-2024",
      content: "garbage",
      nonce: "n",
      key_id: "k",
      updatedAt: "2024-01-03T00:00:00.000Z",
      _modified: "2024-01-03T00:00:00.000Z",
      isDeleted: false,
    };

    const note = await pull(row);

    expect(note.date).toBe("03-01-2024");
    expect(note.content).toBe("");
    expect(note.isDeleted).toBe(false);
  });
});
