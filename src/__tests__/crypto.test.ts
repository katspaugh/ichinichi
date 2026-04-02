import { vi, describe, it, expect, beforeAll } from "vitest";

// Mock sanitizeHtml — DOMPurify requires DOM, not available in node env
vi.mock("../utils/sanitize", () => ({
  sanitizeHtml: (html: string) => html,
}));

import {
  bytesToBase64,
  base64ToBytes,
  generateSalt,
  deriveKEK,
  generateDEK,
  wrapDEK,
  unwrapDEK,
  computeKeyId,
  encryptNote,
  decryptNote,
  encryptImage,
  decryptImage,
} from "../crypto";

// Node 18+: webcrypto available as globalThis.crypto
beforeAll(() => {
  if (!globalThis.crypto) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { webcrypto } = require("crypto");
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      writable: false,
    });
  }
});

describe("encoding helpers", () => {
  it("bytesToBase64 / base64ToBytes roundtrip", () => {
    const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
    const b64 = bytesToBase64(original);
    expect(typeof b64).toBe("string");
    expect(base64ToBytes(b64)).toEqual(original);
  });
});

describe("key management", () => {
  it("generateSalt produces base64 string of correct length", () => {
    const salt = generateSalt();
    expect(typeof salt).toBe("string");
    // 16 bytes → 24 base64 chars (with padding)
    expect(base64ToBytes(salt)).toHaveLength(16);
  });

  it("generateSalt produces different values each call", () => {
    expect(generateSalt()).not.toBe(generateSalt());
  });

  it("generateDEK produces AES-GCM 256-bit key with encrypt+decrypt usages", async () => {
    const dek = await generateDEK();
    expect(dek.type).toBe("secret");
    expect(dek.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect(dek.usages).toContain("encrypt");
    expect(dek.usages).toContain("decrypt");
    expect(dek.extractable).toBe(true);
  });

  it("deriveKEK is deterministic", async () => {
    const salt = generateSalt();
    const kek1 = await deriveKEK("password123", salt, 10_000);
    const kek2 = await deriveKEK("password123", salt, 10_000);
    const raw1 = await crypto.subtle.exportKey("raw", kek1);
    const raw2 = await crypto.subtle.exportKey("raw", kek2);
    expect(new Uint8Array(raw1)).toEqual(new Uint8Array(raw2));
  });

  it("deriveKEK produces different keys for different passwords", async () => {
    const salt = generateSalt();
    const kek1 = await deriveKEK("password1", salt, 10_000);
    const kek2 = await deriveKEK("password2", salt, 10_000);
    const raw1 = await crypto.subtle.exportKey("raw", kek1);
    const raw2 = await crypto.subtle.exportKey("raw", kek2);
    expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2));
  });

  it("wrapDEK / unwrapDEK roundtrip", async () => {
    const dek = await generateDEK();
    const salt = generateSalt();
    const kek = await deriveKEK("passphrase", salt, 10_000);

    const { iv, data } = await wrapDEK(dek, kek);
    const dek2 = await unwrapDEK(data, iv, kek);

    const raw1 = await crypto.subtle.exportKey("raw", dek);
    const raw2 = await crypto.subtle.exportKey("raw", dek2);
    expect(new Uint8Array(raw1)).toEqual(new Uint8Array(raw2));
  });

  it("computeKeyId is deterministic", async () => {
    const dek = await generateDEK();
    const id1 = await computeKeyId(dek);
    const id2 = await computeKeyId(dek);
    expect(id1).toBe(id2);
    expect(typeof id1).toBe("string");
    expect(id1.length).toBeGreaterThan(0);
  });

  it("different DEKs produce different key IDs", async () => {
    const dek1 = await generateDEK();
    const dek2 = await generateDEK();
    expect(await computeKeyId(dek1)).not.toBe(await computeKeyId(dek2));
  });
});

describe("note encryption", () => {
  let dek: CryptoKey;
  let keyId: string;

  beforeAll(async () => {
    dek = await generateDEK();
    keyId = await computeKeyId(dek);
  });

  it("encryptNote / decryptNote roundtrip", async () => {
    const content = "<p>Hello <b>world</b></p>";
    const encrypted = await encryptNote(content, dek, keyId);
    const decrypted = await decryptNote(encrypted, dek);
    expect(decrypted).toBe(content);
  });

  it("same content produces different ciphertext (random IV)", async () => {
    const content = "<p>Same content</p>";
    const enc1 = await encryptNote(content, dek, keyId);
    const enc2 = await encryptNote(content, dek, keyId);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.nonce).not.toBe(enc2.nonce);
  });

  it("wrong key fails to decrypt", async () => {
    const content = "<p>Secret</p>";
    const encrypted = await encryptNote(content, dek, keyId);
    const wrongDek = await generateDEK();
    await expect(decryptNote(encrypted, wrongDek)).rejects.toThrow();
  });
});

describe("image encryption", () => {
  let dek: CryptoKey;
  let keyId: string;

  beforeAll(async () => {
    dek = await generateDEK();
    keyId = await computeKeyId(dek);
  });

  it("encryptImage / decryptImage roundtrip with Blob", async () => {
    const original = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
    const blob = new Blob([original], { type: "image/png" });

    const encrypted = await encryptImage(blob, dek, keyId);
    expect(typeof encrypted.ciphertext).toBe("string");
    expect(typeof encrypted.nonce).toBe("string");
    expect(encrypted.keyId).toBe(keyId);
    expect(typeof encrypted.sha256).toBe("string");

    const decrypted = await decryptImage(encrypted, dek, "image/png");
    expect(decrypted.type).toBe("image/png");

    const buf = await decrypted.arrayBuffer();
    expect(new Uint8Array(buf)).toEqual(original);
  });

  it("sha256 matches original blob content", async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const blob = new Blob([data], { type: "image/jpeg" });
    const encrypted = await encryptImage(blob, dek, keyId);

    const hashBuf = await crypto.subtle.digest("SHA-256", data.buffer);
    const expected = bytesToBase64(new Uint8Array(hashBuf));
    expect(encrypted.sha256).toBe(expected);
  });
});
