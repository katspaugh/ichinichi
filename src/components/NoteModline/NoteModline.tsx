import { useState, useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { AiMeta } from "@/domain/ai/aiTypes";
import styles from "./NoteModline.module.css";

const TAG_COLORS = [
  { dot: "#7c3aed", text: "#5b21b6", bg: "#ede9fe" },
  { dot: "#d97706", text: "#92400e", bg: "#fef3c7" },
  { dot: "#15803d", text: "#166534", bg: "#ecfccb" },
  { dot: "#dc2626", text: "#b91c1c", bg: "#fee2e2" },
  { dot: "#0284c7", text: "#075985", bg: "#e0f2fe" },
  { dot: "#c026d3", text: "#86198f", bg: "#fae8ff" },
];

function tagColor(index: number) {
  return TAG_COLORS[index % TAG_COLORS.length];
}

function parseTags(input: string): string[] {
  return input
    .split(/\s+/)
    .map((t) => (t.startsWith("#") ? t.slice(1) : t))
    .filter(Boolean);
}

interface NoteModlineProps {
  aiMeta: AiMeta | undefined;
  onTagsChange?: (tags: string[]) => void;
}

export function NoteModline({ aiMeta, onTagsChange }: NoteModlineProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = aiMeta?.tags ?? [];
  const hasTags = tags.length > 0;
  const hasInput = inputValue.trim().length > 0;

  const commitInput = useCallback(() => {
    const newTags = parseTags(inputValue);
    if (newTags.length === 0) return;
    const merged = [...tags, ...newTags];
    const unique = [...new Set(merged)];
    onTagsChange?.(unique);
    setInputValue("");
  }, [inputValue, tags, onTagsChange]);

  const removeTag = useCallback(
    (tag: string) => {
      onTagsChange?.(tags.filter((t) => t !== tag));
    },
    [tags, onTagsChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        commitInput();
      }
      if (
        e.key === "Backspace" &&
        inputValue === "" &&
        tags.length > 0
      ) {
        onTagsChange?.(tags.slice(0, -1));
      }
    },
    [commitInput, inputValue, tags, onTagsChange],
  );

  const handleBlur = useCallback(() => {
    commitInput();
  }, [commitInput]);

  if (!hasTags && !hasInput && !onTagsChange) return null;
  if (!aiMeta) return null;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.sparkle}>&#x2728;</span>
        AI Tags
      </div>
      <div className={styles.tags}>
        {tags.map((tag, i) => {
          const c = tagColor(i);
          return (
            <span
              key={tag}
              className={styles.tag}
              style={{ background: c.bg, color: c.text }}
            >
              <span
                className={styles.dot}
                style={{ background: c.dot }}
              />
              {tag}
              {onTagsChange && (
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                >
                  &times;
                </button>
              )}
            </span>
          );
        })}
        {onTagsChange && (
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder=""
            size={Math.max(inputValue.length, 1)}
          />
        )}
      </div>
    </div>
  );
}
