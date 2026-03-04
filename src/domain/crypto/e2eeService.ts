import type { KeyringProvider } from "./keyring";
import type { AiMeta } from "../ai/aiTypes";

export interface NotePayload {
  content: string;
}

export interface E2eeService {
  encryptNoteContent(
    payload: NotePayload,
    keyId?: string | null,
  ): Promise<{ ciphertext: string; nonce: string; keyId: string } | null>;
  decryptNoteRecord(record: {
    keyId?: string | null;
    ciphertext: string;
    nonce: string;
  }): Promise<NotePayload | null>;
  encryptImageBlob(
    blob: Blob,
    keyId?: string | null,
  ): Promise<{
    record: {
      version: 1;
      id: string;
      keyId: string;
      ciphertext: string;
      nonce: string;
    };
    sha256: string;
    size: number;
    keyId: string;
  } | null>;
  decryptImageRecord(
    record: {
      keyId?: string | null;
      ciphertext: string;
      nonce: string;
    },
    mimeType: string,
  ): Promise<Blob | null>;
  encryptAiMeta(
    meta: AiMeta,
    keyId?: string | null,
  ): Promise<{ ciphertext: string; nonce: string; keyId: string } | null>;
  decryptAiMeta(record: {
    keyId?: string | null;
    ciphertext: string;
    nonce: string;
  }): Promise<AiMeta | null>;
}

export interface E2eeServiceFactory {
  create(keyring: KeyringProvider): E2eeService;
}
