import type { CryptoError } from "../errors";
import type { Result } from "../result";
import { ok, err } from "../result";
import type { E2eeService, NotePayload } from "./e2eeService";

export interface EncryptedNote {
  ciphertext: string;
  nonce: string;
  keyId: string;
}

export interface NoteCrypto {
  encrypt(
    content: string,
  ): Promise<Result<EncryptedNote, CryptoError>>;
  decrypt(record: {
    keyId?: string | null;
    ciphertext: string;
    nonce: string;
  }): Promise<Result<NotePayload, CryptoError>>;
}

export function createNoteCrypto(e2ee: E2eeService): NoteCrypto {
  return {
    async encrypt(
      content: string,
    ): Promise<Result<EncryptedNote, CryptoError>> {
      try {
        const result = await e2ee.encryptNoteContent({ content });
        if (!result) {
          return err({
            type: "EncryptFailed",
            message: "Failed to encrypt note",
          });
        }
        return ok({
          ciphertext: result.ciphertext,
          nonce: result.nonce,
          keyId: result.keyId,
        });
      } catch (error) {
        return err({
          type: "Unknown",
          message:
            error instanceof Error ? error.message : "Encryption failed",
        });
      }
    },

    async decrypt(record: {
      keyId?: string | null;
      ciphertext: string;
      nonce: string;
    }): Promise<Result<NotePayload, CryptoError>> {
      try {
        const payload = await e2ee.decryptNoteRecord(record);
        if (!payload) {
          return err({
            type: "DecryptFailed",
            message: "Failed to decrypt note",
          });
        }
        return ok(payload);
      } catch (error) {
        return err({
          type: "Unknown",
          message:
            error instanceof Error ? error.message : "Decryption failed",
        });
      }
    },
  };
}
