// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { createAppDatabase, type AppDatabase } from "../../storage/rxdb/database";
import { RxDBProvider, useRxDB } from "../../hooks/useRxDB";
import { useNote } from "../../hooks/useNote";
import { useNoteDatesRx } from "../../hooks/useNoteDatesRx";
import { useNoteImagesRx } from "../../hooks/useNoteImagesRx";

describe("RxDB React hooks", () => {
  let db: AppDatabase | null = null;

  afterEach(async () => {
    if (db) {
      await db.close();
      db = null;
    }
  });

  async function makeDb() {
    db = await createAppDatabase(`hooks-test-${Date.now()}-${Math.random()}`, { memory: true });
    return db;
  }

  function makeWrapper(database: AppDatabase) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(RxDBProvider, { db: database, children });
    };
  }

  // 1. useRxDB provides database instance
  it("useRxDB provides the database instance", async () => {
    const database = await makeDb();
    const wrapper = makeWrapper(database);

    const { result } = renderHook(() => useRxDB(), { wrapper });

    expect(result.current).toBe(database);
  });

  // 2. useRxDB throws if used outside provider
  it("useRxDB throws when used outside RxDBProvider", () => {
    // Suppress React error boundary noise
    const { result } = renderHook(() => {
      try {
        return useRxDB();
      } catch (e) {
        return e;
      }
    });

    expect(result.current).toBeInstanceOf(Error);
  });

  // 3. useNote returns null for non-existent note
  it("useNote returns null for a non-existent note", async () => {
    const database = await makeDb();
    const wrapper = makeWrapper(database);

    const { result } = renderHook(() => useNote("01-01-2024"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.note).toBeNull();
  });

  // 4. useNote returns note data after insertion
  it("useNote returns note data after insertion", async () => {
    const database = await makeDb();
    const wrapper = makeWrapper(database);

    const { result } = renderHook(() => useNote("15-06-2024"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.note).toBeNull();

    await act(async () => {
      await database.notes.insert({
        date: "15-06-2024",
        content: "Hello world",
        updatedAt: new Date().toISOString(),
        isDeleted: false,
        weather: null,
      });
    });

    await waitFor(() => expect(result.current.note).not.toBeNull());
    expect(result.current.note?.date).toBe("15-06-2024");
    expect(result.current.note?.content).toBe("Hello world");
  });

  // 5. useNote filters out isDeleted docs
  it("useNote returns null for a deleted note", async () => {
    const database = await makeDb();
    const wrapper = makeWrapper(database);

    await database.notes.insert({
      date: "20-01-2024",
      content: "This will be deleted",
      updatedAt: new Date().toISOString(),
      isDeleted: true,
      weather: null,
    });

    const { result } = renderHook(() => useNote("20-01-2024"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.note).toBeNull();
  });

  // 6. useNoteDatesRx returns empty set initially
  it("useNoteDatesRx returns empty set initially", async () => {
    const database = await makeDb();
    const wrapper = makeWrapper(database);

    const { result } = renderHook(() => useNoteDatesRx(), { wrapper });

    await waitFor(() => expect(result.current).toBeInstanceOf(Set));
    expect(result.current.size).toBe(0);
  });

  // 7. useNoteDatesRx updates when notes are added
  it("useNoteDatesRx updates when notes are added", async () => {
    const database = await makeDb();
    const wrapper = makeWrapper(database);

    const { result } = renderHook(() => useNoteDatesRx(), { wrapper });

    await waitFor(() => expect(result.current.size).toBe(0));

    await act(async () => {
      await database.notes.insert({
        date: "10-03-2024",
        content: "A new note",
        updatedAt: new Date().toISOString(),
        isDeleted: false,
        weather: null,
      });
    });

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.has("10-03-2024")).toBe(true);
  });

  // 8. useNoteDatesRx with year filter
  it("useNoteDatesRx filters by year", async () => {
    const database = await makeDb();
    const wrapper = makeWrapper(database);

    await database.notes.bulkInsert([
      { date: "10-03-2024", content: "2024 note", updatedAt: new Date().toISOString(), isDeleted: false, weather: null },
      { date: "05-07-2025", content: "2025 note", updatedAt: new Date().toISOString(), isDeleted: false, weather: null },
    ]);

    const { result } = renderHook(() => useNoteDatesRx(2024), { wrapper });

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.has("10-03-2024")).toBe(true);
    expect(result.current.has("05-07-2025")).toBe(false);
  });

  // 9. useNoteImagesRx returns empty array when no images
  it("useNoteImagesRx returns empty array when no images", async () => {
    const database = await makeDb();
    const wrapper = makeWrapper(database);

    const { result } = renderHook(() => useNoteImagesRx("01-01-2024"), { wrapper });

    await waitFor(() => expect(Array.isArray(result.current)).toBe(true));
    expect(result.current).toHaveLength(0);
  });

  // 10. useNoteImagesRx returns images for a note
  it("useNoteImagesRx returns images for a note", async () => {
    const database = await makeDb();
    const wrapper = makeWrapper(database);

    await database.images.insert({
      id: "img-001",
      noteDate: "01-01-2024",
      type: "inline",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      size: 12345,
      createdAt: new Date().toISOString(),
      isDeleted: false,
    });

    const { result } = renderHook(() => useNoteImagesRx("01-01-2024"), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].id).toBe("img-001");
    expect(result.current[0].filename).toBe("photo.jpg");
  });
});
