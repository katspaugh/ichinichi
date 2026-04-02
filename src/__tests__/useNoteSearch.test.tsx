// @vitest-environment jsdom
import { renderHook, act, waitFor } from "@testing-library/react";
import { useNoteSearch } from "../hooks/useNoteSearch";
import { ok } from "../domain/result";
import { createMockNoteRepository } from "./helpers/mocks";
import type { Note } from "../types";

function makeNote(date: string, content: string): Note {
  return { date, content, updatedAt: new Date().toISOString() };
}

describe("useNoteSearch", () => {
  it("returns empty results for empty query", () => {
    const repo = createMockNoteRepository();
    const { result } = renderHook(() =>
      useNoteSearch(repo, new Set()),
    );
    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it("finds matching notes after debounce", async () => {
    const repo = createMockNoteRepository({
      get: vi.fn().mockImplementation((date: string) => {
        if (date === "14-03-2026") {
          return Promise.resolve(
            ok(makeNote(date, "<p>Team meeting notes for Q1</p>")),
          );
        }
        if (date === "28-02-2026") {
          return Promise.resolve(
            ok(makeNote(date, "<p>Compiled meeting notes from standup</p>")),
          );
        }
        return Promise.resolve(
          ok(makeNote(date, "<p>Unrelated content</p>")),
        );
      }),
    });

    const dates = new Set(["14-03-2026", "28-02-2026", "01-01-2026"]);
    const { result } = renderHook(() => useNoteSearch(repo, dates));

    // Trigger search — internally debounced at 300ms
    act(() => {
      result.current.search("meeting");
    });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(2);
    });

    // Newest first
    expect(result.current.results[0].date).toBe("14-03-2026");
    expect(result.current.results[1].date).toBe("28-02-2026");
  });

  it("strips HTML tags when searching", async () => {
    const repo = createMockNoteRepository({
      get: vi.fn().mockResolvedValue(
        ok(
          makeNote(
            "01-01-2026",
            "<div><b>Bold</b> text with <a href='#'>link</a></div>",
          ),
        ),
      ),
    });

    const dates = new Set(["01-01-2026"]);
    const { result } = renderHook(() => useNoteSearch(repo, dates));

    act(() => {
      result.current.search("Bold text");
    });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0].snippet).toContain("Bold text");
    });
  });

  it("inserts spaces at block-element boundaries", async () => {
    const repo = createMockNoteRepository({
      get: vi.fn().mockResolvedValue(
        ok(
          makeNote(
            "01-01-2026",
            "<div>first paragraph</div><div>second paragraph</div>",
          ),
        ),
      ),
    });

    const dates = new Set(["01-01-2026"]);
    const { result } = renderHook(() => useNoteSearch(repo, dates));

    act(() => {
      result.current.search("paragraph second");
    });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0].snippet).toContain(
        "paragraph second",
      );
    });
  });

  it("is case-insensitive", async () => {
    const repo = createMockNoteRepository({
      get: vi.fn().mockResolvedValue(
        ok(makeNote("01-01-2026", "<p>Hello World</p>")),
      ),
    });

    const dates = new Set(["01-01-2026"]);
    const { result } = renderHook(() => useNoteSearch(repo, dates));

    act(() => {
      result.current.search("hello world");
    });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
    });
  });

  it("returns no results when query does not match", async () => {
    const repo = createMockNoteRepository({
      get: vi.fn().mockResolvedValue(
        ok(makeNote("01-01-2026", "<p>Some content</p>")),
      ),
    });

    const dates = new Set(["01-01-2026"]);
    const { result } = renderHook(() => useNoteSearch(repo, dates));

    act(() => {
      result.current.search("xyznonexistent");
    });

    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
      expect(result.current.results).toHaveLength(0);
    });
  });

  it("generates snippets with ellipsis for long content", async () => {
    const longText = "A".repeat(60) + "MATCH" + "B".repeat(60);
    const repo = createMockNoteRepository({
      get: vi.fn().mockResolvedValue(
        ok(makeNote("01-01-2026", `<p>${longText}</p>`)),
      ),
    });

    const dates = new Set(["01-01-2026"]);
    const { result } = renderHook(() => useNoteSearch(repo, dates));

    act(() => {
      result.current.search("MATCH");
    });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
      const snippet = result.current.results[0].snippet;
      expect(snippet).toMatch(/^\.\.\./);
      expect(snippet).toMatch(/\.\.\.$/);
      expect(snippet).toContain("MATCH");
    });
  });

  it("caches results and reuses on subsequent search", async () => {
    const getMock = vi.fn().mockResolvedValue(
      ok(makeNote("01-01-2026", "<p>Hello World</p>")),
    );
    const repo = createMockNoteRepository({ get: getMock });

    const dates = new Set(["01-01-2026"]);
    const { result } = renderHook(() => useNoteSearch(repo, dates));

    // First search — builds cache
    act(() => {
      result.current.search("hello");
    });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
    });

    const callsAfterFirst = getMock.mock.calls.length;

    // Second search — uses cache
    act(() => {
      result.current.search("world");
    });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0].snippet).toContain("World");
    });

    // No additional get() calls
    expect(getMock.mock.calls.length).toBe(callsAfterFirst);
  });
});
