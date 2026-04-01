import { describe, it, expect } from "vitest";
import {
  parseVaultMeta,
  parseKeyringStore,
  parseUserAccountMap,
  parseCloudDekCachePayload,
  parseCloudKeyIdStore,
  parseRemoteNoteRow,
  parseNoteRecord,
  parseNoteMetaRecord,
  parseDecryptedNotePayload,
  parseStringArray,
} from "../storage/parsers";

describe("parseVaultMeta", () => {
  const valid = {
    version: 1,
    kdf: { salt: "abc", iterations: 600000 },
    wrapped: {
      password: { iv: "iv1", data: "data1" },
      device: { iv: "iv2", data: "data2" },
    },
  };

  it("accepts valid vault meta", () => {
    expect(parseVaultMeta(valid)).toEqual(valid);
  });

  it("accepts without device wrapping", () => {
    const noDevice = {
      ...valid,
      wrapped: { password: { iv: "iv1", data: "data1" } },
    };
    expect(parseVaultMeta(noDevice)).toEqual(noDevice);
  });

  it("rejects wrong version", () => {
    expect(parseVaultMeta({ ...valid, version: 2 })).toBeNull();
  });

  it("rejects missing kdf.salt", () => {
    expect(
      parseVaultMeta({ ...valid, kdf: { iterations: 600000 } }),
    ).toBeNull();
  });

  it("rejects missing wrapped.password", () => {
    expect(parseVaultMeta({ ...valid, wrapped: {} })).toBeNull();
  });

  it("rejects null", () => {
    expect(parseVaultMeta(null)).toBeNull();
  });

  it("rejects string", () => {
    expect(parseVaultMeta("not an object")).toBeNull();
  });
});

describe("parseKeyringStore", () => {
  it("accepts valid keyring", () => {
    const store = { key1: { wrappedDek: "a", dekIv: "b" } };
    expect(parseKeyringStore(store)).toEqual(store);
  });

  it("accepts empty object", () => {
    expect(parseKeyringStore({})).toEqual({});
  });

  it("rejects entry with missing dekIv", () => {
    expect(parseKeyringStore({ key1: { wrappedDek: "a" } })).toBeNull();
  });

  it("rejects non-object", () => {
    expect(parseKeyringStore("string")).toBeNull();
  });
});

describe("parseUserAccountMap", () => {
  it("accepts valid map", () => {
    expect(parseUserAccountMap({ user1: "acct1" })).toEqual({ user1: "acct1" });
  });

  it("rejects map with numeric values", () => {
    expect(parseUserAccountMap({ user1: 42 })).toBeNull();
  });
});

describe("parseCloudDekCachePayload", () => {
  it("accepts valid payload", () => {
    expect(parseCloudDekCachePayload({ iv: "a", data: "b" })).toEqual({
      iv: "a",
      data: "b",
    });
  });

  it("rejects missing data", () => {
    expect(parseCloudDekCachePayload({ iv: "a" })).toBeNull();
  });
});

describe("parseCloudKeyIdStore", () => {
  it("accepts valid store", () => {
    expect(parseCloudKeyIdStore({ user1: ["k1", "k2"] })).toEqual({
      user1: ["k1", "k2"],
    });
  });

  it("rejects non-string array values", () => {
    expect(parseCloudKeyIdStore({ user1: [1, 2] })).toBeNull();
  });
});

describe("parseRemoteNoteRow", () => {
  const valid = {
    id: "id1",
    user_id: "u1",
    date: "01-01-2025",
    ciphertext: "ct",
    nonce: "nc",
    key_id: "k1",
    revision: 1,
    updated_at: "2025-01-01T00:00:00Z",
    server_updated_at: "2025-01-01T00:00:00Z",
    deleted: false,
  };

  it("accepts valid row", () => {
    expect(parseRemoteNoteRow(valid)).toEqual(valid);
  });

  it("accepts row without key_id (legacy)", () => {
    const legacy = { ...valid };
    delete (legacy as Record<string, unknown>).key_id;
    expect(parseRemoteNoteRow(legacy)).toEqual(legacy);
  });

  it("rejects missing id", () => {
    const noId = { ...valid };
    delete (noId as Record<string, unknown>).id;
    expect(parseRemoteNoteRow(noId)).toBeNull();
  });

  it("rejects wrong revision type", () => {
    expect(parseRemoteNoteRow({ ...valid, revision: "1" })).toBeNull();
  });
});

describe("parseNoteRecord", () => {
  const valid = {
    version: 1,
    date: "01-01-2025",
    keyId: "k1",
    ciphertext: "ct",
    nonce: "nc",
    updatedAt: "2025-01-01T00:00:00Z",
  };

  it("accepts valid record", () => {
    expect(parseNoteRecord(valid)).toEqual(valid);
  });

  it("rejects wrong version", () => {
    expect(parseNoteRecord({ ...valid, version: 2 })).toBeNull();
  });
});

describe("parseNoteMetaRecord", () => {
  it("accepts valid meta", () => {
    expect(parseNoteMetaRecord({ date: "01-01-2025", revision: 1 })).toEqual({
      date: "01-01-2025",
      revision: 1,
    });
  });

  it("accepts meta with optional fields", () => {
    const meta = {
      date: "01-01-2025",
      revision: 1,
      deletedAt: "2025-01-01",
      pendingOp: "upsert",
    };
    expect(parseNoteMetaRecord(meta)).toEqual(meta);
  });

  it("rejects missing revision", () => {
    expect(parseNoteMetaRecord({ date: "01-01-2025" })).toBeNull();
  });
});

describe("parseDecryptedNotePayload", () => {
  it("accepts valid payload", () => {
    expect(parseDecryptedNotePayload({ content: "hello" })).toEqual({
      content: "hello",
    });
  });

  it("rejects missing content", () => {
    expect(parseDecryptedNotePayload({})).toBeNull();
  });
});

describe("parseStringArray", () => {
  it("accepts string array", () => {
    expect(parseStringArray(["a", "b"])).toEqual(["a", "b"]);
  });

  it("accepts empty array", () => {
    expect(parseStringArray([])).toEqual([]);
  });

  it("rejects mixed array", () => {
    expect(parseStringArray(["a", 1])).toBeNull();
  });

  it("rejects non-array", () => {
    expect(parseStringArray("string")).toBeNull();
  });
});
