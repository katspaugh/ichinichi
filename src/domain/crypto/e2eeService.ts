import type { KeyringProvider } from "./keyring";

export interface E2eeService {
  encryptNoteContent(
    content: string,
    keyId?: string | null,
  ): Promise<{ ciphertext: string; nonce: string; keyId: string } | null>;
  decryptNoteRecord(record: {
    keyId?: string | null;
    ciphertext: string;
    nonce: string;
  }): Promise<string | null>;
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
}

export interface E2eeServiceFactory {
  create(keyring: KeyringProvider): E2eeService;
}
