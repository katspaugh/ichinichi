import { createUnifiedNoteRepository } from "../storage/unifiedNoteRepository";
import { createUnifiedImageRepository } from "../storage/unifiedImageRepository";
import { closeUnifiedDb } from "../storage/unifiedDb";

async function deleteUnifiedDb(): Promise<void> {
  closeUnifiedDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("dailynotes-unified");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
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

    const note = await repository.get("01-01-2025");
    expect(note?.content).toBe("hello");
    expect(note?.updatedAt).toBeTruthy();
  });

  it("deletes notes and hides them from lists", async () => {
    const vaultKey = await createVaultKey();
    const repository = createUnifiedNoteRepository({
      activeKeyId: "key-1",
      getKey: () => vaultKey,
    });

    await repository.save("02-01-2025", "bye");
    await repository.delete("02-01-2025");

    const note = await repository.get("02-01-2025");
    expect(note).toBeNull();

    const dates = await repository.getAllDates();
    expect(dates).toEqual([]);
  });

  it("stores and retrieves encrypted images", async () => {
    const vaultKey = await createVaultKey();
    const repository = createUnifiedImageRepository({
      activeKeyId: "key-1",
      getKey: () => vaultKey,
    });
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const blob = new Blob([payload], { type: "image/png" });

    const meta = await repository.upload(
      "03-01-2025",
      blob,
      "inline",
      "test.png",
    );
    const stored = await repository.get(meta.id);

    expect(stored).not.toBeNull();
    const storedBytes = new Uint8Array(await blobToArrayBuffer(stored!));
    expect(Array.from(storedBytes)).toEqual(Array.from(payload));

    const byDate = await repository.getByNoteDate("03-01-2025");
    expect(byDate).toHaveLength(1);
    expect(byDate[0]?.id).toBe(meta.id);
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
