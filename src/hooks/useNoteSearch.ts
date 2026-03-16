import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteRepository } from "../storage/noteRepository";
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

export function useNoteSearch(
  repository: NoteRepository | null,
  noteDates: Set<string>,
): UseNoteSearchReturn {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);

  const cacheRef = useRef<Map<string, string>>(new Map());
  const cacheSizeRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Invalidate cache when note count changes
  useEffect(() => {
    if (noteDates.size !== cacheSizeRef.current) {
      cacheRef.current = new Map();
      cacheSizeRef.current = 0;
    }
  }, [noteDates.size]);

  const buildCache = useCallback(
    async (signal: AbortSignal): Promise<boolean> => {
      if (!repository) return false;
      if (cacheRef.current.size > 0) return true;

      const dates = Array.from(noteDates);
      const total = dates.length;
      setProgress({ current: 0, total });

      for (let i = 0; i < dates.length; i++) {
        if (signal.aborted) return false;
        const date = dates[i];
        const result = await repository.get(date);
        if (result.ok && result.value) {
          cacheRef.current.set(date, stripHtml(result.value.content));
        }
        setProgress({ current: i + 1, total });
      }

      cacheSizeRef.current = noteDates.size;
      return true;
    },
    [repository, noteDates],
  );

  const executeSearch = useCallback(
    async (query: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!query.trim()) {
        setResults([]);
        setIsSearching(false);
        setProgress(null);
        return;
      }

      setIsSearching(true);
      const cacheReady = await buildCache(controller.signal);
      if (!cacheReady || controller.signal.aborted) {
        setIsSearching(false);
        setProgress(null);
        return;
      }

      const lowerQuery = query.toLowerCase();
      const matches: SearchResult[] = [];

      for (const [date, text] of cacheRef.current) {
        const lowerText = text.toLowerCase();
        const idx = lowerText.indexOf(lowerQuery);
        if (idx !== -1) {
          const snippet = buildSnippet(text, idx, query.length);
          matches.push({
            date,
            snippet: snippet.text,
            matchIndex: snippet.matchIndex,
            matchLength: query.length,
          });
        }
      }

      matches.sort((a, b) => compareDatesDescending(a.date, b.date));

      if (!controller.signal.aborted) {
        setResults(matches);
        setIsSearching(false);
        setProgress(null);
      }
    },
    [buildCache],
  );

  const search = useCallback(
    (query: string) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => executeSearch(query), 300);
    },
    [executeSearch],
  );

  const clearSearch = useCallback(() => {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setResults([]);
    setIsSearching(false);
    setProgress(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return { results, isSearching, progress, search, clearSearch };
}
