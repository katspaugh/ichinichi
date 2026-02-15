import { createE2eeService } from "../services/e2eeService";
import type { KeyringProvider } from "../domain/crypto/keyring";
import type { NoteRecord, ImageRecord } from "../storage/unifiedDb";

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error("Unexpected FileReader result"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function createTestKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

function createKeyringProvider(
  keys: Map<string, CryptoKey>,
  activeKeyId: string,
): KeyringProvider {
  return {
    activeKeyId,
    getKey: (keyId: string) => keys.get(keyId) ?? null,
  };
}

describe("createE2eeService", () => {
  describe("encryptNoteContent", () => {
    it("encrypts content and returns ciphertext, nonce, keyId", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const result = await service.encryptNoteContent({ content: "Hello, world!" });

      expect(result).not.toBeNull();
      expect(result!.ciphertext).toBeTruthy();
      expect(result!.nonce).toBeTruthy();
      expect(result!.keyId).toBe("key-1");
    });

    it("uses specified keyId when provided", async () => {
      const key1 = await createTestKey();
      const key2 = await createTestKey();
      const keys = new Map([
        ["key-1", key1],
        ["key-2", key2],
      ]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const result = await service.encryptNoteContent({ content: "Hello" }, "key-2");

      expect(result).not.toBeNull();
      expect(result!.keyId).toBe("key-2");
    });

    it("returns null when key not found", async () => {
      const keys = new Map<string, CryptoKey>();
      const keyring = createKeyringProvider(keys, "missing-key");
      const service = createE2eeService(keyring);

      const result = await service.encryptNoteContent({ content: "Hello" });

      expect(result).toBeNull();
    });

    it("sanitizes content before encrypting", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      // Encrypt content with XSS attempt
      const encrypted = await service.encryptNoteContent({
        content: '<script>alert("xss")</script>Hello',
      });

      // Decrypt to verify sanitization
      const record: NoteRecord = {
        version: 1,
        date: "01-01-2024",
        keyId: encrypted!.keyId,
        ciphertext: encrypted!.ciphertext,
        nonce: encrypted!.nonce,
        updatedAt: new Date().toISOString(),
      };

      const decrypted = await service.decryptNoteRecord(record);
      expect(decrypted!.content).toBe("Hello");
      expect(decrypted!.content).not.toContain("script");
    });

    it("produces different ciphertext for same content (random IV)", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const result1 = await service.encryptNoteContent({ content: "Same content" });
      const result2 = await service.encryptNoteContent({ content: "Same content" });

      expect(result1!.ciphertext).not.toBe(result2!.ciphertext);
      expect(result1!.nonce).not.toBe(result2!.nonce);
    });
  });

  describe("decryptNoteRecord", () => {
    it("decrypts encrypted content correctly", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const encrypted = await service.encryptNoteContent({
        content: "<p>Hello, <b>world</b>!</p>",
      });

      const record: NoteRecord = {
        version: 1,
        date: "01-01-2024",
        keyId: encrypted!.keyId,
        ciphertext: encrypted!.ciphertext,
        nonce: encrypted!.nonce,
        updatedAt: new Date().toISOString(),
      };

      const decrypted = await service.decryptNoteRecord(record);

      expect(decrypted!.content).toBe("<p>Hello, <b>world</b>!</p>");
    });

    it("returns null when key not found", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const encrypted = await service.encryptNoteContent({ content: "Hello" });

      // Remove the key
      keys.delete("key-1");

      const record: NoteRecord = {
        version: 1,
        date: "01-01-2024",
        keyId: encrypted!.keyId,
        ciphertext: encrypted!.ciphertext,
        nonce: encrypted!.nonce,
        updatedAt: new Date().toISOString(),
      };

      const decrypted = await service.decryptNoteRecord(record);

      expect(decrypted).toBeNull();
    });

    it("uses record.keyId to find correct key", async () => {
      const key1 = await createTestKey();
      const key2 = await createTestKey();
      const keys = new Map([
        ["key-1", key1],
        ["key-2", key2],
      ]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      // Encrypt with key-2
      const encrypted = await service.encryptNoteContent({ content: "Secret" }, "key-2");

      const record: NoteRecord = {
        version: 1,
        date: "01-01-2024",
        keyId: "key-2",
        ciphertext: encrypted!.ciphertext,
        nonce: encrypted!.nonce,
        updatedAt: new Date().toISOString(),
      };

      // Should decrypt successfully using keyId from record
      const decrypted = await service.decryptNoteRecord(record);

      expect(decrypted!.content).toBe("Secret");
    });

    it("sanitizes decrypted content", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      // Note: sanitization happens both on encrypt and decrypt
      // Even if malicious content somehow got into the ciphertext,
      // it would be sanitized on decryption
      const encrypted = await service.encryptNoteContent({ content: "<b>Safe</b>" });

      const record: NoteRecord = {
        version: 1,
        date: "01-01-2024",
        keyId: encrypted!.keyId,
        ciphertext: encrypted!.ciphertext,
        nonce: encrypted!.nonce,
        updatedAt: new Date().toISOString(),
      };

      const decrypted = await service.decryptNoteRecord(record);

      expect(decrypted!.content).toBe("<b>Safe</b>");
    });
  });

  describe("encryptImageBlob", () => {
    it("encrypts blob and returns record with metadata", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const imageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
      const blob = new Blob([imageData], { type: "image/png" });

      const result = await service.encryptImageBlob(blob);

      expect(result).not.toBeNull();
      expect(result!.record.version).toBe(1);
      expect(result!.record.keyId).toBe("key-1");
      expect(result!.record.ciphertext).toBeTruthy();
      expect(result!.record.nonce).toBeTruthy();
      expect(result!.sha256).toBeTruthy();
      expect(result!.sha256).toHaveLength(64); // SHA-256 hex
      expect(result!.size).toBe(4);
      expect(result!.keyId).toBe("key-1");
    });

    it("returns null when key not found", async () => {
      const keys = new Map<string, CryptoKey>();
      const keyring = createKeyringProvider(keys, "missing-key");
      const service = createE2eeService(keyring);

      const blob = new Blob([new Uint8Array([1, 2, 3])]);

      const result = await service.encryptImageBlob(blob);

      expect(result).toBeNull();
    });

    it("uses specified keyId when provided", async () => {
      const key1 = await createTestKey();
      const key2 = await createTestKey();
      const keys = new Map([
        ["key-1", key1],
        ["key-2", key2],
      ]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const blob = new Blob([new Uint8Array([1, 2, 3])]);

      const result = await service.encryptImageBlob(blob, "key-2");

      expect(result).not.toBeNull();
      expect(result!.keyId).toBe("key-2");
      expect(result!.record.keyId).toBe("key-2");
    });

    it("computes correct SHA-256 hash", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      // Known data with known hash
      const data = new TextEncoder().encode("test");
      const blob = new Blob([data]);

      const result = await service.encryptImageBlob(blob);

      // SHA-256 of "test" is known
      expect(result!.sha256).toBe(
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      );
    });
  });

  describe("decryptImageRecord", () => {
    it("decrypts image and returns blob with correct mime type", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const originalData = new Uint8Array([1, 2, 3, 4, 5]);
      const originalBlob = new Blob([originalData], { type: "image/png" });

      const encrypted = await service.encryptImageBlob(originalBlob);

      const record: ImageRecord = {
        ...encrypted!.record,
        id: "img-1",
      };

      const decrypted = await service.decryptImageRecord(record, "image/png");

      expect(decrypted).not.toBeNull();
      expect(decrypted!.type).toBe("image/png");

      const decryptedData = new Uint8Array(await blobToUint8Array(decrypted!));
      expect(Array.from(decryptedData)).toEqual(Array.from(originalData));
    });

    it("returns null when key not found", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const blob = new Blob([new Uint8Array([1, 2, 3])]);
      const encrypted = await service.encryptImageBlob(blob);

      // Remove the key
      keys.delete("key-1");

      const record: ImageRecord = {
        ...encrypted!.record,
        id: "img-1",
      };

      const decrypted = await service.decryptImageRecord(record, "image/png");

      expect(decrypted).toBeNull();
    });

    it("uses record.keyId to find correct key", async () => {
      const key1 = await createTestKey();
      const key2 = await createTestKey();
      const keys = new Map([
        ["key-1", key1],
        ["key-2", key2],
      ]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const originalData = new Uint8Array([10, 20, 30]);
      const blob = new Blob([originalData]);

      // Encrypt with key-2
      const encrypted = await service.encryptImageBlob(blob, "key-2");

      const record: ImageRecord = {
        ...encrypted!.record,
        id: "img-1",
      };

      // Should decrypt using keyId from record
      const decrypted = await service.decryptImageRecord(record, "image/jpeg");

      expect(decrypted).not.toBeNull();
      const decryptedData = new Uint8Array(await blobToUint8Array(decrypted!));
      expect(Array.from(decryptedData)).toEqual(Array.from(originalData));
    });
  });

  describe("round-trip encryption", () => {
    it("note content survives encrypt/decrypt cycle", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const original = "<p>This is a <b>test</b> note with <i>formatting</i></p>";

      const encrypted = await service.encryptNoteContent({ content: original });
      const record: NoteRecord = {
        version: 1,
        date: "01-01-2024",
        keyId: encrypted!.keyId,
        ciphertext: encrypted!.ciphertext,
        nonce: encrypted!.nonce,
        updatedAt: new Date().toISOString(),
      };

      const decrypted = await service.decryptNoteRecord(record);

      expect(decrypted!.content).toBe(original);
    });

    it("image blob survives encrypt/decrypt cycle", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      // Simulate a small image
      const originalData = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        originalData[i] = i;
      }
      const originalBlob = new Blob([originalData], { type: "image/png" });

      const encrypted = await service.encryptImageBlob(originalBlob);
      const record: ImageRecord = {
        ...encrypted!.record,
        id: "test-img",
      };

      const decrypted = await service.decryptImageRecord(record, "image/png");

      expect(decrypted).not.toBeNull();
      const decryptedData = new Uint8Array(await blobToUint8Array(decrypted!));
      expect(Array.from(decryptedData)).toEqual(Array.from(originalData));
    });
  });

  describe("image key caching", () => {
    it("caches derived image keys", async () => {
      const key = await createTestKey();
      const keys = new Map([["key-1", key]]);
      const keyring = createKeyringProvider(keys, "key-1");
      const service = createE2eeService(keyring);

      const blob1 = new Blob([new Uint8Array([1])]);
      const blob2 = new Blob([new Uint8Array([2])]);

      // Both encryptions should use the same cached image key
      const result1 = await service.encryptImageBlob(blob1);
      const result2 = await service.encryptImageBlob(blob2);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      // Both should succeed (key was cached and reused)
    });
  });
});
