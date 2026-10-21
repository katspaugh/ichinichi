import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { NoteRepository } from "../storage/noteRepository";
import { reportError } from "../utils/errorReporter";
import type { NoteSections } from "../utils/habits";
import { parseDate } from "../utils/date";

export interface SearchResult {
  date: string;
  snippet: string;
  matchIndex: number;
  matchLength: number;
}

export interface SearchProgress {
  current: number;
  total: number;
}

interface UseNoteSearchReturn {
  results: SearchResult[];
  isSearching: boolean;
  progress: SearchProgress | null;
  search: (query: string) => void;
  clearSearch: () => void;
  error: string | null;
}

const SNIPPET_RADIUS = 50;

/**
 * Strip HTML tags from note content to get plain text for searching.
 * Uses DOMParser (safe — does not execute scripts) instead of innerHTML.
 */
function stripHtml(html: string): string {
  // Insert space before every tag so adjacent elements don't merge.
  // DOMParser then strips the tags, leaving clean spaced text.
  const spaced = html.replace(/</g, " <");
  const doc = new DOMParser().parseFromString(spaced, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

interface Snippet {
  text: string;
  matchIndex: number;
}

function buildSnippet(
  text: string,
  index: number,
  queryLength: number,
): Snippet {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + queryLength + SNIPPET_RADIUS);
  let snippet = text.slice(start, end);
  let matchOffset = index - start;
  if (start > 0) {
    snippet = "..." + snippet;
    matchOffset += 3;
  }
  if (end < text.length) snippet = snippet + "...";
  return { text: snippet, matchIndex: matchOffset };
}

function compareDatesDescending(a: string, b: string): number {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return 0;
  return db.getTime() - da.getTime();
}

interface SearchInputs {
  repository: NoteRepository | null;
  dates: ReadonlySet<string>;
  tag: string | null;
}
export interface SearchState {
  phase: "idle" | "searching" | "ready" | "error";
  inputs: SearchInputs;
  query: string;
  revision: number;
  results: SearchResult[];
  progress: SearchProgress | null;
  error: string | null;
}
type SearchEvent =
  | { type: "INPUTS"; inputs: SearchInputs }
  | { type: "SEARCH"; query: string }
  | { type: "PROGRESS"; revision: number; progress: SearchProgress }
  | { type: "COMPLETE"; revision: number; results: SearchResult[] }
  | { type: "FAILED"; revision: number }
  | { type: "CLEAR" };

export function searchReducer(
  state: SearchState,
  event: SearchEvent,
): SearchState {
  switch (event.type) {
    case "INPUTS":
      if (state.inputs === event.inputs) return state;
      return {
        ...state,
        inputs: event.inputs,
        results: [],
        progress: null,
        error: null,
        phase: state.query.trim() || event.inputs.tag ? "searching" : "idle",
        revision: state.revision + 1,
      };
    case "SEARCH":
      return {
        ...state,
        query: event.query,
        results: [],
        progress: null,
        error: null,
        phase: event.query.trim() || state.inputs.tag ? "searching" : "idle",
        revision: state.revision + 1,
      };
    case "CLEAR":
      return {
        ...state,
        phase: "idle",
        query: "",
        results: [],
        progress: null,
        error: null,
        revision: state.revision + 1,
      };
    case "PROGRESS":
      return state.phase === "searching" && event.revision === state.revision
        ? { ...state, progress: event.progress }
        : state;
    case "COMPLETE":
      return state.phase === "searching" && event.revision === state.revision
        ? { ...state, phase: "ready", results: event.results, progress: null }
        : state;
    case "FAILED":
      return state.phase === "searching" && event.revision === state.revision
        ? {
            ...state,
            phase: "error",
            progress: null,
            error: "Unable to search notes. Please try again.",
          }
        : state;
  }
}

const EMPTY_SECTIONS: NoteSections = new Map();
export function useNoteSearch(
  repository: NoteRepository | null,
  noteDates: Set<string>,
  {
    tag = null,
    sections = EMPTY_SECTIONS,
  }: { tag?: string | null; sections?: NoteSections } = {},
): UseNoteSearchReturn {
  const allDatesKey = [...noteDates].sort().join(",");
  const eligibleKey = [...noteDates]
    .filter((date) => !tag || sections.get(date)?.includes(tag))
    .sort()
    .join(",");
  const dates = useMemo(
    () => new Set(eligibleKey ? eligibleKey.split(",") : []),
    [eligibleKey],
  );
  const inputs = useMemo(
    () => ({ repository, dates, tag }),
    [repository, dates, tag],
  );
  const cache = useMemo(
    () => ({
      repository,
      datesKey: allDatesKey,
      values: new Map<string, string | null>(),
    }),
    [repository, allDatesKey],
  );
  const [state, dispatch] = useReducer(searchReducer, inputs, (initial): SearchState => ({
    phase: initial.tag ? "searching" : "idle",
    inputs: initial,
    query: "",
    revision: 0,
    results: [],
    progress: null,
    error: null,
  }));

  useEffect(() => {
    dispatch({ type: "INPUTS", inputs });
  }, [inputs]);

  useEffect(() => {
    if (state.phase !== "searching") return;
    if (state.inputs !== inputs) return;
    const controller = new AbortController();
    const revision = state.revision;
    const run = async () => {
      try {
        const matches: SearchResult[] = [];
        const source = state.inputs;
        const query = state.query.trim();
        const lowerQuery = query.toLowerCase();
        const sourceDates = [...source.dates];
        dispatch({
          type: "PROGRESS",
          revision,
          progress: { current: 0, total: sourceDates.length },
        });
        for (const [index, date] of sourceDates.entries()) {
          if (controller.signal.aborted) return;
          if (!cache.values.has(date) && source.repository) {
            const result = await source.repository.get(date);
            if (controller.signal.aborted) return;
            if (!result.ok) throw new Error(result.error.message);
            cache.values.set(
              date,
              result.value ? stripHtml(result.value.content) : null,
            );
          }
          const text = cache.values.get(date);
          if (text !== undefined && text !== null) {
            const matchIndex = query
              ? text.toLowerCase().indexOf(lowerQuery)
              : 0;
            if (matchIndex !== -1) {
              const snippet = buildSnippet(text, matchIndex, query.length);
              matches.push({
                date,
                snippet: snippet.text,
                matchIndex: query ? snippet.matchIndex : -1,
                matchLength: query.length,
              });
            }
          }
          dispatch({
            type: "PROGRESS",
            revision,
            progress: { current: index + 1, total: sourceDates.length },
          });
        }
        matches.sort((a, b) => compareDatesDescending(a.date, b.date));
        if (!controller.signal.aborted)
          dispatch({ type: "COMPLETE", revision, results: matches });
      } catch (error) {
        if (controller.signal.aborted) return;
        reportError("noteSearch.search", error);
        dispatch({ type: "FAILED", revision });
      }
    };
    const timer = setTimeout(
      () => {
        void run();
      },
      state.query.trim() ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [state.phase, state.revision, state.query, state.inputs, inputs, cache]);

  const search = useCallback(
    (query: string) => dispatch({ type: "SEARCH", query }),
    [],
  );
  const clearSearch = useCallback(() => dispatch({ type: "CLEAR" }), []);
  const current = state.inputs === inputs;
  return {
    results: current ? state.results : [],
    isSearching: !current || state.phase === "searching",
    progress: current ? state.progress : null,
    search,
    clearSearch,
    error: current ? state.error : null,
  };
}
