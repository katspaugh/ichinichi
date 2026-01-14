import {
  IMAGES_STORE,
  IMAGE_META_STORE,
  openUnifiedDb,
  type ImageMetaRecord,
  type ImageRecord,
} from "./unifiedDb";

export async function storeImageAndMeta(
  record: ImageRecord,
  meta: ImageMetaRecord,
): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGES_STORE, IMAGE_META_STORE], "readwrite");
    tx.objectStore(IMAGES_STORE).put(record);
    tx.objectStore(IMAGE_META_STORE).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getImageRecord(
  imageId: string,
): Promise<ImageRecord | null> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE, "readonly");
    const request = tx.objectStore(IMAGES_STORE).get(imageId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getImageMeta(
  imageId: string,
): Promise<ImageMetaRecord | null> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_META_STORE, "readonly");
    const request = tx.objectStore(IMAGE_META_STORE).get(imageId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllImageMeta(): Promise<ImageMetaRecord[]> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_META_STORE, "readonly");
    const store = tx.objectStore(IMAGE_META_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMetaByDate(
  noteDate: string,
): Promise<ImageMetaRecord[]> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_META_STORE, "readonly");
    const index = tx.objectStore(IMAGE_META_STORE).index("noteDate");
    const request = index.getAll(noteDate);
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteImageRecords(imageId: string): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGES_STORE, IMAGE_META_STORE], "readwrite");
    tx.objectStore(IMAGES_STORE).delete(imageId);
    tx.objectStore(IMAGE_META_STORE).delete(imageId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteImageRecord(imageId: string): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE, "readwrite");
    tx.objectStore(IMAGES_STORE).delete(imageId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function setImageMeta(meta: ImageMetaRecord): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_META_STORE, "readwrite");
    tx.objectStore(IMAGE_META_STORE).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteImagesByDate(noteDate: string): Promise<void> {
  const db = await openUnifiedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGES_STORE, IMAGE_META_STORE], "readwrite");
    const metaStore = tx.objectStore(IMAGE_META_STORE);
    const index = metaStore.index("noteDate");
    const request = index.getAllKeys(noteDate);
    request.onsuccess = () => {
      const keys = request.result as IDBValidKey[];
      keys.forEach((key) => {
        metaStore.delete(key);
        tx.objectStore(IMAGES_STORE).delete(key);
      });
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
