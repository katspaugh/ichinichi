import {
  deriveImageKey,
  encryptImageBuffer,
  decryptImageBuffer,
} from "../storage/unifiedImageCrypto";
import { base64ToBytes, bytesToBase64 } from "../storage/cryptoUtils";

jest.setTimeout(20000);

async function createVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

describe("unifiedImageCrypto", () => {
  describe("deriveImageKey", () => {
    it("derives a usable AES-GCM key from a vault key", async () => {
      const vaultKey = await createVaultKey();
      const imageKey = await deriveImageKey(vaultKey);

      expect(imageKey).toBeDefined();
      expect(imageKey.type).toBe("secret");
      expect(imageKey.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
      expect(imageKey.usages).toContain("encrypt");
      expect(imageKey.usages).toContain("decrypt");
    });

    it("is deterministic — same vault key always yields same image key", async () => {
      const vaultKey = await createVaultKey();

      const key1 = await deriveImageKey(vaultKey);
      const key2 = await deriveImageKey(vaultKey);

      // Encrypt with key1, decrypt with key2 to prove equivalence
      const plaintext = new Uint8Array([10, 20, 30, 40, 50]);
      const { ciphertext, nonce } = await encryptImageBuffer(key1, plaintext);
      const decrypted = await decryptImageBuffer(key2, ciphertext, nonce);

      expect(new Uint8Array(decrypted)).toEqual(plaintext);
    });

    it("produces different image keys for different vault keys", async () => {
      const vaultKey1 = await createVaultKey();
      const vaultKey2 = await createVaultKey();

      const imageKey1 = await deriveImageKey(vaultKey1);
      const imageKey2 = await deriveImageKey(vaultKey2);

      // Encrypt with key1, try to decrypt with key2 — should fail
      const plaintext = new Uint8Array([1, 2, 3]);
      const { ciphertext, nonce } = await encryptImageBuffer(imageKey1, plaintext);

      await expect(
        decryptImageBuffer(imageKey2, ciphertext, nonce),
      ).rejects.toThrow();
    });
  });

  describe("encryptImageBuffer / decryptImageBuffer round-trip", () => {
    it("encrypts and decrypts small binary data", async () => {
      const vaultKey = await createVaultKey();
      const imageKey = await deriveImageKey(vaultKey);
      const plaintext = new Uint8Array([255, 0, 128, 64, 32]);

      const { ciphertext, nonce } = await encryptImageBuffer(imageKey, plaintext);
      const decrypted = await decryptImageBuffer(imageKey, ciphertext, nonce);

      expect(new Uint8Array(decrypted)).toEqual(plaintext);
    });

    it("encrypts and decrypts larger buffer", async () => {
      const vaultKey = await createVaultKey();
      const imageKey = await deriveImageKey(vaultKey);
      // Simulate a small "image" (10KB)
      const plaintext = new Uint8Array(10240);
      for (let i = 0; i < plaintext.length; i++) {
        plaintext[i] = i % 256;
      }

      const { ciphertext, nonce } = await encryptImageBuffer(imageKey, plaintext);
      const decrypted = await decryptImageBuffer(imageKey, ciphertext, nonce);

      expect(new Uint8Array(decrypted)).toEqual(plaintext);
    });

    it("accepts ArrayBuffer input", async () => {
      const vaultKey = await createVaultKey();
      const imageKey = await deriveImageKey(vaultKey);
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

      const { ciphertext, nonce } = await encryptImageBuffer(
        imageKey,
        plaintext.buffer as ArrayBuffer,
      );
      const decrypted = await decryptImageBuffer(imageKey, ciphertext, nonce);

      expect(new Uint8Array(decrypted)).toEqual(plaintext);
    });

    it("produces base64-encoded ciphertext and nonce", async () => {
      const vaultKey = await createVaultKey();
      const imageKey = await deriveImageKey(vaultKey);
      const plaintext = new Uint8Array([42]);

      const { ciphertext, nonce } = await encryptImageBuffer(imageKey, plaintext);

      // Valid base64 strings
      expect(() => base64ToBytes(ciphertext)).not.toThrow();
      expect(() => base64ToBytes(nonce)).not.toThrow();

      // Nonce should be 12 bytes (96-bit IV for AES-GCM)
      expect(base64ToBytes(nonce).length).toBe(12);
    });

    it("produces unique nonces per encryption (random IV)", async () => {
      const vaultKey = await createVaultKey();
      const imageKey = await deriveImageKey(vaultKey);
      const plaintext = new Uint8Array([1, 2, 3]);

      const result1 = await encryptImageBuffer(imageKey, plaintext);
      const result2 = await encryptImageBuffer(imageKey, plaintext);

      expect(result1.nonce).not.toBe(result2.nonce);
      // Ciphertext also differs due to different IVs
      expect(result1.ciphertext).not.toBe(result2.ciphertext);
    });

    it("ciphertext is different from plaintext", async () => {
      const vaultKey = await createVaultKey();
      const imageKey = await deriveImageKey(vaultKey);
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

      const { ciphertext } = await encryptImageBuffer(imageKey, plaintext);
      const ciphertextBytes = base64ToBytes(ciphertext);

      // Ciphertext should be longer (includes GCM auth tag)
      expect(ciphertextBytes.length).toBeGreaterThan(plaintext.length);
    });

    it("fails to decrypt with wrong nonce", async () => {
      const vaultKey = await createVaultKey();
      const imageKey = await deriveImageKey(vaultKey);
      const plaintext = new Uint8Array([1, 2, 3]);

      const { ciphertext } = await encryptImageBuffer(imageKey, plaintext);
      const wrongNonce = bytesToBase64(new Uint8Array(12)); // all zeros

      await expect(
        decryptImageBuffer(imageKey, ciphertext, wrongNonce),
      ).rejects.toThrow();
    });

    it("fails to decrypt with wrong key", async () => {
      const vaultKey1 = await createVaultKey();
      const vaultKey2 = await createVaultKey();
      const imageKey1 = await deriveImageKey(vaultKey1);
      const imageKey2 = await deriveImageKey(vaultKey2);

      const plaintext = new Uint8Array([1, 2, 3]);
      const { ciphertext, nonce } = await encryptImageBuffer(imageKey1, plaintext);

      await expect(
        decryptImageBuffer(imageKey2, ciphertext, nonce),
      ).rejects.toThrow();
    });

    it("handles empty buffer", async () => {
      const vaultKey = await createVaultKey();
      const imageKey = await deriveImageKey(vaultKey);
      const plaintext = new Uint8Array(0);

      const { ciphertext, nonce } = await encryptImageBuffer(imageKey, plaintext);
      const decrypted = await decryptImageBuffer(imageKey, ciphertext, nonce);

      expect(new Uint8Array(decrypted)).toEqual(plaintext);
    });
  });
});
