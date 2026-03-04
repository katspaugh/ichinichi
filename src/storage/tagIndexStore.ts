import type { TagIndex } from "../domain/ai/tagMatcher";

const DB_NAME = "dailynotes-tag-index";
const DB_VERSION = 1;
const STORE_NAME = "tag_vectors";
const IDB_TIMEOUT_MS = 3000;

function buildKey(version: string, model: string): string {
  return `${version}:${model}`;
}

interface StoredTagIndex {
  key: string;
  tagIds: string[];
  tagLabels: string[];
  /** Each element is the raw ArrayBuffer backing a Float32Array */
  vectors: ArrayBuffer[];
}

function openTagIndexDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    const timer = setTimeout(() => {
      reject(new Error("Tag index DB open timed out"));
    }, IDB_TIMEOUT_MS);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      clearTimeout(timer);
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
  });
}

export async function loadTagIndex(
  version: string,
  model: string,
): Promise<TagIndex | null> {
  const db = await openTagIndexDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(buildKey(version, model));

      req.onsuccess = () => {
        const record = req.result as StoredTagIndex | undefined;
        if (!record) {
          resolve(null);
          return;
        }
        const vectors = record.vectors.map((buf) => new Float32Array(buf));
        resolve({
          tagIds: record.tagIds,
          tagLabels: record.tagLabels,
          vectors,
        });
      };

      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveTagIndex(
  version: string,
  model: string,
  index: TagIndex,
): Promise<void> {
  const db = await openTagIndexDb();
  try {
    const record: StoredTagIndex = {
      key: buildKey(version, model),
      tagIds: index.tagIds,
      tagLabels: index.tagLabels,
      vectors: index.vectors.map((v) =>
        v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer,
      ),
    };

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
