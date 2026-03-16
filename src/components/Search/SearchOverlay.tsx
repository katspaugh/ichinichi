import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Search } from "lucide-react";
import {
  useNoteSearch,
  type SearchResult,
} from "../../hooks/useNoteSearch";
import type { NoteRepository } from "../../storage/noteRepository";
import { parseDate } from "../../utils/date";
import styles from "./SearchOverlay.module.css";

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelectDate: (date: string) => void;
  repository: NoteRepository | null;
  noteDates: Set<string>;
}

function highlightSnippet(result: SearchResult): React.ReactNode {
  const { snippet, matchIndex, matchLength } = result;
  if (matchIndex < 0 || matchIndex >= snippet.length) return snippet;
  const before = snippet.slice(0, matchIndex);
  const match = snippet.slice(matchIndex, matchIndex + matchLength);
  const after = snippet.slice(matchIndex + matchLength);
  return (
    <>
      {before}
      <mark className={styles.highlight}>{match}</mark>
      {after}
    </>
  );
}

function formatResultDate(dateStr: string): { label: string; year: string } {
  const parsed = parseDate(dateStr);
  if (!parsed) return { label: dateStr, year: "" };
  const label = parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return { label, year: String(parsed.getFullYear()) };
}

export function SearchOverlay({
  open,
  onClose,
  onSelectDate,
  repository,
  noteDates,
}: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { results, isSearching, progress, search } =
    useNoteSearch(repository, noteDates);

  const handleSelect = useCallback(
    (date: string) => {
      onSelectDate(date);
      onClose();
    },
    [onSelectDate, onClose],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex].date);
          }
          break;
      }
    },
    [results, selectedIndex, handleSelect, onClose],
  );

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      setSelectedIndex(0);
      search(value);
    },
    [search],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  const hasQuery = query.trim().length > 0;
  const showProgress = isSearching && progress !== null;
  const showResults = !isSearching && hasQuery && results.length > 0;
  const showEmpty = !isSearching && hasQuery && results.length === 0;

  return (
    <div
      className={styles.overlay}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.container}>
        <div className={styles.inputWrapper}>
          <Search className={styles.searchIcon} />
          <input
            className={styles.input}
            type="text"
            autoFocus
            placeholder="Search notes..."
            value={query}
            onChange={handleInputChange}
            autoComplete="off"
            spellCheck={false}
          />
          <span className={styles.escBadge}>ESC</span>
        </div>

        {showProgress && progress && (
          <div className={styles.progressWrapper}>
            <div className={styles.progressText}>
              Searching {progress.current} / {progress.total} notes...
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {showResults && (
          <>
            <div className={styles.resultCount}>
              {results.length} {results.length === 1 ? "note" : "notes"} found
            </div>
            <div ref={listRef} className={styles.resultsList}>
              {results.map((result, i) => {
                const { label, year } = formatResultDate(result.date);
                return (
                  <div
                    key={result.date}
                    className={`${styles.resultItem} ${
                      i === selectedIndex ? styles.resultItemSelected : ""
                    }`}
                    onClick={() => handleSelect(result.date)}
                  >
                    <div className={styles.resultDate}>
                      <span className={styles.resultDateLabel}>{label}</span>
                      <span className={styles.resultYear}>{year}</span>
                    </div>
                    <div className={styles.resultSnippet}>
                      {highlightSnippet(result)}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {showEmpty && (
          <div className={styles.emptyState}>
            No notes found matching &ldquo;{query}&rdquo;
          </div>
        )}

        {(showResults || showEmpty) && (
          <div className={styles.footer}>
            <span>↑↓ navigate</span>
            <span>↵ open note</span>
            <span>esc close</span>
          </div>
        )}
      </div>
    </div>
  );
}
