import type { E2eeService, NotePayload } from "../domain/crypto/e2eeService";
import type { KeyringProvider } from "../domain/crypto/keyring";
import type { HabitValues } from "../types";
import { sanitizeHtml } from "../utils/sanitize";
import {
  base64ToBytes,
  bytesToBase64,
  decodeUtf8,
  encodeUtf8,
  randomBytes,
} from "../storage/cryptoUtils";
import {
  decryptImageBuffer,
  deriveImageKey,
  encryptImageBuffer,
} from "../storage/unifiedImageCrypto";

const NOTE_IV_BYTES = 12;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(buffer));
  return bytesToHex(new Uint8Array(digest));
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (blob.arrayBuffer) {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("Unexpected FileReader result"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export function createE2eeService(keyring: KeyringProvider): E2eeService {
  const imageKeyCache = new Map<string, Promise<CryptoKey>>();

  const getKey = (keyId: string): CryptoKey | null => {
    return keyring.getKey(keyId);
  };

  const getImageKey = async (keyId: string): Promise<CryptoKey | null> => {
    const baseKey = getKey(keyId);
    if (!baseKey) return null;
    if (!imageKeyCache.has(keyId)) {
      imageKeyCache.set(keyId, deriveImageKey(baseKey));
    }
    return imageKeyCache.get(keyId)!;
  };

  const encryptNoteContent = async (
    payload: NotePayload,
    keyId?: string | null,
  ): Promise<{ ciphertext: string; nonce: string; keyId: string } | null> => {
    const resolvedKeyId = keyId ?? keyring.activeKeyId;
    const key = getKey(resolvedKeyId);
    if (!key) return null;
    const iv = randomBytes(NOTE_IV_BYTES);
    const sanitized = sanitizeHtml(payload.content);
    const envelope: { content: string; habits?: HabitValues } = { content: sanitized };
    if (payload.habits && Object.keys(payload.habits).length > 0) {
      envelope.habits = payload.habits;
    }
    const plaintext = encodeUtf8(JSON.stringify(envelope));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext,
    );
    return {
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      nonce: bytesToBase64(iv),
      keyId: resolvedKeyId,
    };
  };

  const decryptNoteRecord = async (
    record: { keyId?: string | null; ciphertext: string; nonce: string },
  ): Promise<NotePayload | null> => {
    const keyId = record.keyId ?? keyring.activeKeyId;
    const key = getKey(keyId);
    if (!key) return null;
    const iv = base64ToBytes(record.nonce);
    const ciphertext = base64ToBytes(record.ciphertext);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    const parsed = JSON.parse(decodeUtf8(new Uint8Array(decrypted))) as {
      content: string;
      habits?: HabitValues;
    };
    return {
      content: sanitizeHtml(parsed.content),
      habits: parsed.habits,
    };
  };

  const encryptImageBlob: E2eeService["encryptImageBlob"] = async (
    blob: Blob,
    keyId?: string | null,
  ) => {
    const resolvedKeyId = keyId ?? keyring.activeKeyId;
    const imageKey = await getImageKey(resolvedKeyId);
    if (!imageKey) return null;
    const buffer = await blobToArrayBuffer(blob);
    const bytes = new Uint8Array(buffer);
    const sha256 = await computeSha256Hex(buffer);
    const { ciphertext, nonce } = await encryptImageBuffer(imageKey, bytes);
    return {
      record: {
        version: 1 as const,
        id: "",
        keyId: resolvedKeyId,
        ciphertext,
        nonce,
      },
      sha256,
      size: buffer.byteLength,
      keyId: resolvedKeyId,
    };
  };

  const decryptImageRecord = async (
    record: { keyId?: string | null; ciphertext: string; nonce: string },
    mimeType: string,
  ): Promise<Blob | null> => {
    const keyId = record.keyId ?? keyring.activeKeyId;
    const imageKey = await getImageKey(keyId);
    if (!imageKey) return null;
    const decrypted = await decryptImageBuffer(
      imageKey,
      record.ciphertext,
      record.nonce,
    );
    return new Blob([decrypted], { type: mimeType });
  };

  return {
    encryptNoteContent,
    decryptNoteRecord,
    encryptImageBlob,
    decryptImageRecord,
  };
}
