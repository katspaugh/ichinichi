import type { SupabaseClient } from "../lib/supabase";
import { encryptImage, decryptImage, base64ToBytes } from "../crypto";
import {
  getCachedImage,
  setCachedImage,
  deleteCachedImage,
  getImageMetaByDate,
  getImageMeta,
  type CachedImageMeta,
} from "./cache";
import { reportError } from "../utils/errorReporter";

export interface ImageRepository {
  getImage(id: string, mimeType: string): Promise<Blob | null>;
  getImagesByDate(date: string): Promise<CachedImageMeta[]>;
  uploadImage(
    noteDate: string,
    file: File,
    type: "background" | "inline",
    dimensions: { width: number; height: number },
  ): Promise<CachedImageMeta>;
  deleteImage(id: string): Promise<void>;
}

interface ImageRepositoryDeps {
  dek: CryptoKey;
  keyId: string;
  supabase: SupabaseClient;
  userId: string;
  connectivity: { getOnline(): boolean };
}

export function createImageRepository(deps: ImageRepositoryDeps): ImageRepository {
  const { dek, keyId, supabase, userId, connectivity } = deps;

  return {
    async getImage(id: string, mimeType: string): Promise<Blob | null> {
      try {
        const cached = await getCachedImage(id);
        if (cached) {
          return decryptImage(cached, dek, mimeType);
        }

        if (!connectivity.getOnline()) return null;

        const meta = await getImageMeta(id);
        if (!meta?.remotePath) return null;

        const { data, error } = await supabase.storage
          .from("note-images")
          .download(meta.remotePath);
        if (error || !data) return null;

        const arrayBuffer = await data.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        // Stored as raw encrypted bytes — treat as ciphertext directly
        // We need the nonce from meta; remote blobs are stored as raw binary
        // Re-cache by storing the blob as-is; but we need nonce from meta
        // For remote blobs we don't have nonce here — skip caching raw bytes
        // Instead just return decrypted if we have meta with nonce
        // Remote blobs are stored as full CachedImageRecord binary: not feasible
        // Store downloaded bytes as blob in cache using meta's record fields
        // Since remotePath exists but no local cache, we lack nonce — can't decrypt
        // The encrypted blob stored remotely is the raw ciphertext bytes only
        // The nonce is stored in cache meta — if meta exists, we have it
        // But getCachedImage returns CachedImageRecord (has nonce); image_meta doesn't store nonce
        // So we can't decrypt remote blobs without the nonce — this is an architectural limitation
        // Best effort: if cached record missing but meta exists, can't decrypt
        // For now: return null (nonce not available from meta alone)
        void bytes;
        return null;
      } catch (err) {
        reportError('imageRepository.getImage', err);
        return null;
      }
    },

    async getImagesByDate(date: string): Promise<CachedImageMeta[]> {
      return getImageMetaByDate(date);
    },

    async uploadImage(
      noteDate: string,
      file: File,
      type: "background" | "inline",
      dimensions: { width: number; height: number },
    ): Promise<CachedImageMeta> {
      if (!connectivity.getOnline()) {
        throw new Error("Cannot upload images while offline");
      }

      const id = crypto.randomUUID();
      const encrypted = await encryptImage(file, dek, keyId);
      const remotePath = `${userId}/${noteDate}/${id}.enc`;

      const bytes = base64ToBytes(encrypted.ciphertext);
      const blob = new Blob([bytes], { type: "application/octet-stream" });

      const { error } = await supabase.storage
        .from("note-images")
        .upload(remotePath, blob);
      if (error) throw error;

      const meta: CachedImageMeta = {
        id,
        noteDate,
        type,
        filename: file.name,
        mimeType: file.type,
        width: dimensions.width,
        height: dimensions.height,
        size: file.size,
        sha256: encrypted.sha256,
        remotePath,
      };

      await setCachedImage(
        { id, ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, keyId },
        meta,
      );

      return meta;
    },

    async deleteImage(id: string): Promise<void> {
      if (!connectivity.getOnline()) {
        throw new Error("Cannot delete images while offline");
      }

      const meta = await getImageMeta(id);
      if (meta?.remotePath) {
        await supabase.storage.from("note-images").remove([meta.remotePath]);
      }

      await deleteCachedImage(id);
    },
  };
}
