import type {
  AutoTagCheckpoint,
  AutoTagCheckpointStore,
} from "../types/autoTags";
import { parseAutoTagCheckpoints, parseCloudDekCachePayload } from "./parsers";
import {
  base64ToBytes,
  bytesToBase64,
  encodeUtf8,
  randomBytes,
} from "./cryptoUtils";
import { reportError } from "../utils/errorReporter";

/** Device-only resumable results, encrypted with the active vault key. No note text is stored. */
export class EncryptedAutoTagCache implements AutoTagCheckpointStore {
  private storageKey: string;
  private key: CryptoKey;
  constructor(scope: string, key: CryptoKey) {
    this.storageKey = `ichinichi_auto_tags_checkpoints_v1:${scope}`;
    this.key = key;
  }

  async load(): Promise<AutoTagCheckpoint[]> {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const envelope = parseCloudDekCachePayload(JSON.parse(raw));
      if (!envelope) return [];
      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: base64ToBytes(envelope.iv),
          additionalData: encodeUtf8(this.storageKey),
        },
        this.key,
        base64ToBytes(envelope.data),
      );
      return (
        parseAutoTagCheckpoints(
          JSON.parse(new TextDecoder().decode(decrypted)),
        ) ?? []
      );
    } catch (error) {
      reportError("autoTags.cache.load", error);
      return [];
    }
  }

  async save(records: AutoTagCheckpoint[], signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const iv = randomBytes(12);
    try {
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encodeUtf8(this.storageKey) },
        this.key,
        encodeUtf8(JSON.stringify({ version: 1, entries: records })),
      );
      signal.throwIfAborted();
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({
          iv: bytesToBase64(iv),
          data: bytesToBase64(new Uint8Array(encrypted)),
        }),
      );
    } catch (error) {
      if (!signal.aborted) reportError("autoTags.cache.save", error);
      throw error;
    }
  }
}
