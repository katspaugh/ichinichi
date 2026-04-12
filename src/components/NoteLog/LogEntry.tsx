import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { applyTextTransforms } from "../../services/editorTextTransforms";
import { sanitizeHtml } from "../../utils/sanitize";
import contentStyles from "../../styles/noteContent.module.css";
import styles from "./LogEntry.module.css";

interface LogEntryProps {
  id: string;
  timestamp: string | null;
  label: string | null;
  html: string;
  onSave: (html: string) => void;
  onDelete?: () => void;
  focusTargetRef?: RefObject<string | null>;
  justSaved?: boolean;
}

function serializeContent(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const node of clone.querySelectorAll("[class]")) {
    node.removeAttribute("class");
  }
  for (const img of clone.querySelectorAll("img[data-image-id]")) {
    img.removeAttribute("src");
  }
  for (const node of clone.querySelectorAll("[style]")) {
    node.removeAttribute("style");
  }
  return clone.innerHTML;
}

export function LogEntry({
  id,
  label,
  html,
  onSave,
  onDelete,
  focusTargetRef,
  justSaved,
}: LogEntryProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(false);

  // Auto-focus when this card is the focus target after a deletion
  useEffect(() => {
    if (focusTargetRef?.current === id && editorRef.current) {
      focusTargetRef.current = null;
      editorRef.current.focus();
      const sel = window.getSelection();
      if (sel) {
        sel.selectAllChildren(editorRef.current);
        sel.collapseToEnd();
      }
    }
  });

  const handleStartEdit = useCallback(() => {
    isEditingRef.current = true;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.selectAllChildren(el);
      sel.collapseToEnd();
    }
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!isEditingRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    isEditingRef.current = false;
    onSave(serializeContent(el));
  }, [onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSaveEdit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        isEditingRef.current = false;
        editorRef.current?.blur();
      }
      if (e.key === "Backspace" && onDelete) {
        const el = editorRef.current;
        if (!el) return;
        const text = (el.textContent ?? "").trim();
        const hasImages = el.querySelector("img") !== null;
        if (!text && !hasImages) {
          e.preventDefault();
          isEditingRef.current = false;
          onDelete();
        }
      }
    },
    [handleSaveEdit, onDelete],
  );

  const handleBlur = useCallback(() => {
    if (isEditingRef.current) {
      handleSaveEdit();
    }
  }, [handleSaveEdit]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      applyTextTransforms(editorRef.current);
    }
  }, []);

  // Note: html is pre-sanitized by the storage layer; sanitizeHtml is applied
  // here as defense-in-depth, consistent with the app's sanitization pattern.
  const sanitized = sanitizeHtml(html);

  return (
    <div className={styles.card} data-just-saved={justSaved || undefined}>
      {label && <div className={styles.timestamp}>{label}</div>}
      <div
        ref={editorRef}
        className={`${contentStyles.content} ${styles.cardContent}`}
        contentEditable
        suppressContentEditableWarning
        onClick={handleStartEdit}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onInput={handleInput}
        dangerouslySetInnerHTML={{ __html: sanitized }}
        role="textbox"
        aria-multiline="true"
      />
    </div>
  );
}
