import { describe, it, expect, afterEach } from "vitest";
import { createAppDatabase, type AppDatabase } from "../../storage/rxdb/database";
import { RxDBNoteRepository } from "../../storage/rxdb/noteRepository";

describe("RxDBNoteRepository", () => {
  let db: AppDatabase | null = null;

  afterEach(async () => {
    if (db) {
      await db.close();
      db = null;
    }
  });

  async function makeRepo() {
    db = await createAppDatabase(`test-notes-${Date.now()}-${Math.random()}`, { memory: true });
    return new RxDBNoteRepository(db);
  }

  it("returns null for a non-existent note", async () => {
    const repo = await makeRepo();
    const result = await repo.get("01-01-2024");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it("saves and retrieves a note", async () => {
    const repo = await makeRepo();
    const saveResult = await repo.save("15-06-2024", "Hello world");
    expect(saveResult.ok).toBe(true);

    const getResult = await repo.get("15-06-2024");
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value).not.toBeNull();
      expect(getResult.value?.date).toBe("15-06-2024");
      expect(getResult.value?.content).toBe("Hello world");
    }
  });

  it("updates an existing note", async () => {
    const repo = await makeRepo();
    await repo.save("10-03-2024", "Original content");
    await repo.save("10-03-2024", "Updated content");

    const result = await repo.get("10-03-2024");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.content).toBe("Updated content");
    }
  });

  it("soft-deletes a note", async () => {
    const repo = await makeRepo();
    await repo.save("20-04-2024", "Some note");
    const deleteResult = await repo.delete("20-04-2024");
    expect(deleteResult.ok).toBe(true);

    // get should return null for deleted note
    const getResult = await repo.get("20-04-2024");
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value).toBeNull();
    }
  });

  it("returns all dates with non-deleted notes", async () => {
    const repo = await makeRepo();
    await repo.save("01-01-2024", "Note 1");
    await repo.save("02-01-2024", "Note 2");
    await repo.save("03-01-2024", "Note 3");
    await repo.delete("02-01-2024");

    const result = await repo.getAllDates();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain("01-01-2024");
      expect(result.value).toContain("03-01-2024");
      expect(result.value).not.toContain("02-01-2024");
    }
  });

  it("returns dates filtered by year", async () => {
    const repo = await makeRepo();
    await repo.save("05-05-2023", "Note in 2023");
    await repo.save("10-10-2024", "Note in 2024");
    await repo.save("15-03-2024", "Another note in 2024");

    const result2024 = await repo.getAllDatesForYear(2024);
    expect(result2024.ok).toBe(true);
    if (result2024.ok) {
      expect(result2024.value).toContain("10-10-2024");
      expect(result2024.value).toContain("15-03-2024");
      expect(result2024.value).not.toContain("05-05-2023");
    }

    const result2023 = await repo.getAllDatesForYear(2023);
    expect(result2023.ok).toBe(true);
    if (result2023.ok) {
      expect(result2023.value).toContain("05-05-2023");
      expect(result2023.value).not.toContain("10-10-2024");
    }
  });

  it("saves weather with a note", async () => {
    const repo = await makeRepo();
    const weather = {
      icon: "sunny",
      temperatureHigh: 28,
      temperatureLow: 18,
      unit: "C" as const,
      city: "Tokyo",
    };
    await repo.save("25-07-2024", "Hot day", weather);

    const result = await repo.get("25-07-2024");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.weather).toEqual(weather);
    }
  });

  it("restores a soft-deleted note", async () => {
    const repo = await makeRepo();
    await repo.save("12-12-2024", "Note to restore");
    await repo.delete("12-12-2024");

    // Confirm it's deleted
    const deletedResult = await repo.get("12-12-2024");
    expect(deletedResult.ok).toBe(true);
    if (deletedResult.ok) expect(deletedResult.value).toBeNull();

    // Restore it
    const restoreResult = await repo.restoreNote?.("12-12-2024");
    expect(restoreResult?.ok).toBe(true);

    // Now it should be visible again
    const restoredResult = await repo.get("12-12-2024");
    expect(restoredResult.ok).toBe(true);
    if (restoredResult.ok) {
      expect(restoredResult.value).not.toBeNull();
      expect(restoredResult.value?.content).toBe("Note to restore");
    }
  });

  it("getIncludingDeleted returns deleted notes", async () => {
    const repo = await makeRepo();
    await repo.save("30-11-2024", "Soft-deleted note");
    await repo.delete("30-11-2024");

    const result = await repo.getIncludingDeleted?.("30-11-2024");
    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.value).not.toBeNull();
      expect(result.value?.date).toBe("30-11-2024");
    }
  });
});
