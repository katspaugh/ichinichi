import { createUnifiedNoteRepository } from "../storage/unifiedNoteRepository";
import { createUnifiedImageRepository } from "../storage/unifiedImageRepository";
import { closeUnifiedDb } from "../storage/unifiedDb";
import { getAllAccountDbNames } from "../storage/accountStore";

async function deleteUnifiedDb(): Promise<void> {
  closeUnifiedDb();
  const dbNames = getAllAccountDbNames();
  await Promise.all(
    dbNames.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => resolve();
        }),
    ),
  );
}

async function createVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

describe("unified storage", () => {
  beforeEach(async () => {
    await deleteUnifiedDb();
  });

  it("stores and retrieves notes", async () => {
    const vaultKey = await createVaultKey();
    const repository = createUnifiedNoteRepository({
      activeKeyId: "key-1",
      getKey: () => vaultKey,
    });

    await repository.save("01-01-2025", "hello");

    const noteResult = await repository.get("01-01-2025");
    expect(noteResult.ok).toBe(true);
    if (noteResult.ok) {
      expect(noteResult.value?.content).toBe("hello");
      expect(noteResult.value?.updatedAt).toBeTruthy();
    }
  });

  it("deletes notes and hides them from lists", async () => {
    const vaultKey = await createVaultKey();
    const repository = createUnifiedNoteRepository({
      activeKeyId: "key-1",
      getKey: () => vaultKey,
    });

    await repository.save("02-01-2025", "bye");
    await repository.delete("02-01-2025");

    const noteResult = await repository.get("02-01-2025");
    expect(noteResult.ok).toBe(true);
    if (noteResult.ok) {
      expect(noteResult.value).toBeNull();
    }

    const datesResult = await repository.getAllDates();
    expect(datesResult.ok).toBe(true);
    if (datesResult.ok) {
      expect(datesResult.value).toEqual([]);
    }
  });

  it("stores and retrieves encrypted images", async () => {
    const vaultKey = await createVaultKey();
    const repository = createUnifiedImageRepository({
      activeKeyId: "key-1",
      getKey: () => vaultKey,
    });
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const blob = new Blob([payload], { type: "image/png" });

    const metaResult = await repository.upload(
      "03-01-2025",
      blob,
      "inline",
      "test.png",
    );
    expect(metaResult.ok).toBe(true);
    if (!metaResult.ok) return;

    const storedResult = await repository.get(metaResult.value.id);
    expect(storedResult.ok).toBe(true);
    if (!storedResult.ok) return;

    expect(storedResult.value).not.toBeNull();
    const storedBytes = new Uint8Array(await blobToArrayBuffer(storedResult.value!));
    expect(Array.from(storedBytes)).toEqual(Array.from(payload));

    const byDateResult = await repository.getByNoteDate("03-01-2025");
    expect(byDateResult.ok).toBe(true);
    if (byDateResult.ok) {
      expect(byDateResult.value).toHaveLength(1);
      expect(byDateResult.value[0]?.id).toBe(metaResult.value.id);
    }
  });
});

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
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
