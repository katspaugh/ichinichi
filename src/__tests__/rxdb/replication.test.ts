import { describe, it, expect } from "vitest";
import {
  createPushModifier,
  createPullModifier,
  createNotesPullHandler,
} from "../../storage/rxdb/replication";
import type {
  ReplicationCrypto,
  SupabaseNoteRow,
} from "../../storage/rxdb/replication";
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

// Realistic crypto: non-deterministic encryption (random nonce each call),
// mimicking real AES-GCM where each encrypt produces different ciphertext.
let nonDetCounter = 0;
const nonDeterministicCrypto: ReplicationCrypto = {
  async encrypt(payload) {
    const nonce = `nonce-${++nonDetCounter}`;
    const ciphertext = btoa(JSON.stringify({ ...payload, _nonce: nonce }));
    return { ok: true, value: { ciphertext, nonce, keyId: "mockkey" } };
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
    expect(row._deleted).toBe(false);
    expect(row.key_id).toBe("mockkey");
    expect(row.nonce).toBe("mocknonce");
    expect(row.updated_at).toBe("2024-01-01T00:00:00.000Z");
    expect(row._modified).toBeDefined();
    // ciphertext should decode back to the original payload
    const decoded = JSON.parse(atob(row.ciphertext));
    expect(decoded.content).toBe("<p>Hello</p>");
    expect(decoded.weather).toBeNull();
    // content and weather must be stripped from output
    expect(row).not.toHaveProperty("content");
    expect(row).not.toHaveProperty("weather");
  });

  it("maps isDeleted to _deleted", async () => {
    const push = createPushModifier(mockCrypto);
    const note: NoteDocType = {
      date: "02-01-2024",
      content: "",
      updatedAt: "2024-01-02T00:00:00.000Z",
      isDeleted: true,
    };

    const row = await push(note);
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
      ciphertext: btoa(JSON.stringify(payload)),
      nonce: "mocknonce",
      key_id: "mockkey",
      updated_at: "2024-01-01T00:00:00.000Z",
      _modified: "2024-01-01T00:00:00.000Z",
      _deleted: false,
    };

    const note = await pull(row);

    expect(note.date).toBe("01-01-2024");
    expect(note.content).toBe("<p>World</p>");
    expect(note.weather).toBeNull();
    expect(note.updatedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(note.isDeleted).toBe(false);
  });

  it("returns empty content with isDeleted true when _deleted is true", async () => {
    const pull = createPullModifier(mockCrypto);
    const row = {
      date: "02-01-2024",
      ciphertext: "does-not-matter",
      nonce: "n",
      key_id: "k",
      updated_at: "2024-01-02T00:00:00.000Z",
      _modified: "2024-01-02T00:00:00.000Z",
      _deleted: true,
    };

    const note = await pull(row);

    expect(note.isDeleted).toBe(true);
    expect(note.content).toBe("");
    expect(note.date).toBe("02-01-2024");
  });

  it("throws when decryption fails (instead of fabricating empty content)", async () => {
    // Returning a fake doc with content="" silently overwrites local state
    // for any row a device cannot decrypt — typically caused by a key_id
    // missing from the device's keyring. Throwing surfaces the failure to
    // the caller so it can skip the row and log, leaving local state intact.
    const pull = createPullModifier(failingCrypto);
    const row = {
      date: "03-01-2024",
      ciphertext: "garbage",
      nonce: "n",
      key_id: "k",
      updated_at: "2024-01-03T00:00:00.000Z",
      _modified: "2024-01-03T00:00:00.000Z",
      _deleted: false,
    };

    await expect(pull(row)).rejects.toThrow();
  });

  it("throws when row fails to parse", async () => {
    const pull = createPullModifier(mockCrypto);
    const malformed = { date: "04-01-2024" };

    await expect(pull(malformed as never)).rejects.toThrow();
  });
});

describe("createNotesPullHandler", () => {
  // Build a fake supabase chain that returns the given rows.
  function fakeSupabase(rows: Record<string, unknown>[]) {
    const chain = {
      select: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: rows, error: null }),
    };
    return { from: () => chain } as unknown as Parameters<
      typeof createNotesPullHandler
    >[0];
  }

  it("skips undecryptable rows without poisoning the batch", async () => {
    // Rows: A (good), B (decrypt fails), C (good). Without per-row
    // try/catch, B's failure would either reject Promise.all (losing A and
    // C) or fabricate a fake content="" doc (overwriting B's local state).
    // After the fix B is dropped entirely and A and C still apply.
    const goodPayload = (content: string) =>
      btoa(JSON.stringify({ content, weather: null }));
    const rows = [
      {
        date: "01-01-2024",
        ciphertext: goodPayload("A"),
        nonce: "n",
        key_id: "mockkey",
        updated_at: "2024-01-01T00:00:00.000Z",
        _modified: "2024-01-01T00:00:00.000Z",
        _deleted: false,
      },
      {
        date: "02-01-2024",
        ciphertext: "not-base64-json", // decrypts to JSON.parse failure
        nonce: "n",
        key_id: "mockkey",
        updated_at: "2024-01-02T00:00:00.000Z",
        _modified: "2024-01-02T00:00:00.000Z",
        _deleted: false,
      },
      {
        date: "03-01-2024",
        ciphertext: goodPayload("C"),
        nonce: "n",
        key_id: "mockkey",
        updated_at: "2024-01-03T00:00:00.000Z",
        _modified: "2024-01-03T00:00:00.000Z",
        _deleted: false,
      },
    ];

    const pull = createPullModifier(mockCrypto);
    const handler = createNotesPullHandler(
      fakeSupabase(rows),
      pull as (row: SupabaseNoteRow) => Promise<NoteDocType>,
    );
    const result = await handler(undefined, 100);

    expect(result.documents).toHaveLength(2);
    expect(result.documents.map((d) => d.date)).toEqual([
      "01-01-2024",
      "03-01-2024",
    ]);
    // Critically: no doc with date "02-01-2024" with content="" was emitted.
    expect(
      result.documents.find((d) => d.date === "02-01-2024"),
    ).toBeUndefined();
    // Checkpoint advances to the last row so newer rows still sync.
    expect(result.checkpoint?.id).toBe("03-01-2024");
  });
});

describe("push optimistic concurrency with non-deterministic encryption", () => {
  it("push modifier produces stable updated_at for the same input doc", async () => {
    const push = createPushModifier(nonDeterministicCrypto);
    const note: NoteDocType = {
      date: "01-01-2024",
      content: "<p>Hello</p>",
      updatedAt: "2024-01-01T12:00:00.000Z",
      isDeleted: false,
      weather: null,
    };

    const row1 = await push(note);
    const row2 = await push(note);

    // Ciphertext and nonce are non-deterministic (different each call)
    expect(row1.ciphertext).not.toBe(row2.ciphertext);
    expect(row1.nonce).not.toBe(row2.nonce);

    // But updated_at is deterministic — same input produces same output.
    // This is why optimistic concurrency must use updated_at, not ciphertext/nonce.
    expect(row1.updated_at).toBe(row2.updated_at);
    expect(row1.updated_at).toBe("2024-01-01T12:00:00.000Z");
  });
});
