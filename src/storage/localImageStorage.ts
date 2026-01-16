import type { NoteImage } from "../types";
import type { ImageRepository } from "./imageRepository";
import type { RepositoryError } from "../domain/errors";
import { ok, err, type Result } from "../domain/result";
import { base64ToBytes, bytesToBase64, randomBytes } from "./cryptoUtils";

const IMAGE_IV_BYTES = 12;
const IMAGES_DB_NAME = "dailynotes-images";
const IMAGES_STORE = "images"; // Stores encrypted image blobs
const META_STORE = "image_meta"; // Stores image metadata

interface EncryptedImagePayload {
  version: 1;
  iv: string;
  data: string; // Base64 encoded encrypted blob
}

/**
 * Open the local images database
 */
function openImagesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGES_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      // Create images store for encrypted blobs
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE);
      }

      // Create metadata store
      if (!db.objectStoreNames.contains(META_STORE)) {
        const metaStore = db.createObjectStore(META_STORE, { keyPath: "id" });
        // Index by noteDate for efficient queries
        metaStore.createIndex("noteDate", "noteDate", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Encrypt an image blob
 */
async function encryptImageBlob(
  vaultKey: CryptoKey,
  blob: Blob,
): Promise<EncryptedImagePayload> {
  const iv = randomBytes(IMAGE_IV_BYTES);
  const buffer = await blob.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    vaultKey,
    buffer,
  );

  return {
    version: 1,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypt an image payload to blob
 */
async function decryptImagePayload(
  vaultKey: CryptoKey,
  payload: EncryptedImagePayload,
  mimeType: string,
): Promise<Blob> {
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    vaultKey,
    ciphertext,
  );

  return new Blob([decrypted], { type: mimeType });
}

/**
 * Generate a UUID v4
 */
function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Store encrypted image and metadata
 */
async function storeImage(
  imageId: string,
  payload: EncryptedImagePayload,
  meta: NoteImage,
): Promise<void> {
  const db = await openImagesDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGES_STORE, META_STORE], "readwrite");

    // Store encrypted blob
    tx.objectStore(IMAGES_STORE).put(payload, imageId);

    // Store metadata
    tx.objectStore(META_STORE).put(meta);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Get encrypted image payload
 */
async function getImagePayload(
  imageId: string,
): Promise<EncryptedImagePayload | null> {
  const db = await openImagesDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE, "readonly");
    const request = tx.objectStore(IMAGES_STORE).get(imageId);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Get image metadata
 */
async function getImageMeta(imageId: string): Promise<NoteImage | null> {
  const db = await openImagesDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const request = tx.objectStore(META_STORE).get(imageId);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Get all image metadata for a note date
 */
async function getImageMetaByDate(noteDate: string): Promise<NoteImage[]> {
  const db = await openImagesDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const index = tx.objectStore(META_STORE).index("noteDate");
    const request = index.getAll(noteDate);

    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Delete image and metadata
 */
async function deleteImage(imageId: string): Promise<void> {
  const db = await openImagesDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGES_STORE, META_STORE], "readwrite");

    tx.objectStore(IMAGES_STORE).delete(imageId);
    tx.objectStore(META_STORE).delete(imageId);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Delete all images for a note date
 */
async function deleteImagesByDate(noteDate: string): Promise<void> {
  const images = await getImageMetaByDate(noteDate);

  await Promise.all(images.map((img) => deleteImage(img.id)));
}

/**
 * Create encrypted image repository using IndexedDB
 * Images are encrypted with the vault key before storage
 *
 * @param vaultKey - The vault encryption key
 * @returns ImageRepository implementation
 */
export function createEncryptedImageRepository(
  vaultKey: CryptoKey,
): ImageRepository {
  return {
    async upload(
      noteDate: string,
      file: Blob,
      type: "background" | "inline",
      filename: string,
      options?: { width?: number; height?: number },
    ): Promise<Result<NoteImage, RepositoryError>> {
      try {
        const imageId = generateUuid();

        // Encrypt the image blob
        const payload = await encryptImageBlob(vaultKey, file);

        // Create metadata
        const meta: NoteImage = {
          id: imageId,
          noteDate,
          type,
          filename,
          mimeType: file.type,
          width: options?.width ?? 0,
          height: options?.height ?? 0,
          size: file.size,
          createdAt: new Date().toISOString(),
        };

        // Store encrypted blob and metadata
        await storeImage(imageId, payload, meta);

        return ok(meta);
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to upload image",
        });
      }
    },

    async get(imageId: string): Promise<Result<Blob | null, RepositoryError>> {
      try {
        const payload = await getImagePayload(imageId);
        const meta = await getImageMeta(imageId);

        if (!payload || !meta || payload.version !== 1) {
          return ok(null);
        }

        const blob = await decryptImagePayload(vaultKey, payload, meta.mimeType);
        return ok(blob);
      } catch (error) {
        return err({
          type: "DecryptFailed",
          message: error instanceof Error ? error.message : "Failed to decrypt image",
        });
      }
    },

    async getUrl(_imageId: string): Promise<Result<string | null, RepositoryError>> {
      void _imageId;
      return ok(null);
    },

    async delete(imageId: string): Promise<Result<void, RepositoryError>> {
      try {
        await deleteImage(imageId);
        return ok(undefined);
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to delete image",
        });
      }
    },

    async getByNoteDate(noteDate: string): Promise<Result<NoteImage[], RepositoryError>> {
      try {
        const metas = await getImageMetaByDate(noteDate);
        return ok(metas);
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to get images by date",
        });
      }
    },

    async deleteByNoteDate(noteDate: string): Promise<Result<void, RepositoryError>> {
      try {
        await deleteImagesByDate(noteDate);
        return ok(undefined);
      } catch (error) {
        return err({
          type: "IO",
          message: error instanceof Error ? error.message : "Failed to delete images by date",
        });
      }
    },
  };
}
