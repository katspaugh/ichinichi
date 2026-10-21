// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useNoteSearch } from "../hooks/useNoteSearch";
import { SearchOverlay } from "../components/Search/SearchOverlay";
import { createMockNoteRepository } from "./helpers/mocks";
import { ok } from "../domain/result";

const dates = new Set(["19-10-2026", "20-10-2026", "18-10-2026"]);
const sections = new Map([
  ["19-10-2026", ["trumpet"]],
  ["20-10-2026", ["trumpet"]],
  ["18-10-2026", ["reading"]],
]);
function repository() {
  return createMockNoteRepository({
    get: vi.fn(async (date: string) =>
      ok({
        date,
        content:
          date === "20-10-2026"
            ? "<p>Worked on my embouchure and scales.</p>"
            : date === "19-10-2026"
              ? "<p>Played at rehearsal.</p>"
              : "<p>Read a book about trumpet music.</p>",
        updatedAt: "2026-10-20T12:00:00Z",
      }),
    ),
  });
}

describe("tag-filtered note search", () => {
  it("loads all exact tag members with no text query, newest first", async () => {
    const repo = repository();
    const { result } = renderHook(() =>
      useNoteSearch(repo, dates, { tag: "trumpet", sections }),
    );
    await waitFor(() => expect(result.current.results).toHaveLength(2));
    expect(result.current.results.map((note) => note.date)).toEqual([
      "20-10-2026",
      "19-10-2026",
    ]);
    expect(result.current.results[0].snippet).toContain("embouchure");
    expect(repo.get).not.toHaveBeenCalledWith("18-10-2026");
    expect(result.current.results[0].matchLength).toBe(0);
  });
  it("supports text searches within the selected tag", async () => {
    const repo = repository();
    const { result } = renderHook(() =>
      useNoteSearch(repo, dates, { tag: "trumpet", sections }),
    );
    act(() => result.current.search("scales"));
    await waitFor(() =>
      expect(result.current.results.map((note) => note.date)).toEqual([
        "20-10-2026",
      ]),
    );
  });
  it("ignores a late response after changing tags", async () => {
    const repo = repository();
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = repo.get.getMockImplementation()!;
    repo.get.mockImplementation(async (date) => {
      if (date === "20-10-2026") await pending;
      return original(date);
    });
    const { result, rerender } = renderHook(
      ({ tag }) => useNoteSearch(repo, dates, { tag, sections }),
      { initialProps: { tag: "trumpet" } },
    );
    await waitFor(() => expect(repo.get).toHaveBeenCalledWith("20-10-2026"));
    rerender({ tag: "reading" });
    await waitFor(() =>
      expect(result.current.results.map((note) => note.date)).toEqual([
        "18-10-2026",
      ]),
    );
    await act(async () => release());
    expect(result.current.results.map((note) => note.date)).toEqual([
      "18-10-2026",
    ]);
  });
  it("replaces results when the tag changes", async () => {
    const repo = repository();
    const { result, rerender } = renderHook(
      ({ tag }) => useNoteSearch(repo, dates, { tag, sections }),
      { initialProps: { tag: "trumpet" } },
    );
    await waitFor(() => expect(result.current.results).toHaveLength(2));
    rerender({ tag: "reading" });
    await waitFor(() =>
      expect(result.current.results.map((note) => note.date)).toEqual([
        "18-10-2026",
      ]),
    );
  });
  it("uses the existing results UI to open a tagged entry", async () => {
    const select = vi.fn(),
      close = vi.fn();
    render(
      <SearchOverlay
        open
        onClose={close}
        onSelectDate={select}
        repository={repository()}
        noteDates={dates}
        tagFilter="trumpet"
        noteSections={sections}
      />,
    );
    await screen.findByText("2 notes found");
    expect(
      screen.getByPlaceholderText("Search within trumpet..."),
    ).toBeTruthy();
    expect(screen.queryByText("Read a book about trumpet music.")).toBeNull();
    fireEvent.click(screen.getByText("Worked on my embouchure and scales."));
    expect(select).toHaveBeenCalledWith("20-10-2026");
    expect(close).toHaveBeenCalledOnce();
  });
});
