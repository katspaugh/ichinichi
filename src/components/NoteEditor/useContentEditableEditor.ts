import { useCallback, useEffect, useRef } from "react";
import type {
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
} from "react";
import { handleKeyDown as hotkeyHandleKeyDown } from "../../services/editorHotkeys";
import { applyTextTransforms } from "../../services/editorTextTransforms";
import {
  saveResilientCursorPosition,
  restoreResilientCursorPosition,
} from "../../services/editorTextTransforms/cursor";
import { applySectionColors } from "../../services/sectionColors";
import { getTimestampLabel } from "../../services/timestampLabel";

const TIMESTAMP_ATTR = "data-timestamp";
const TIMESTAMP_LABEL_ATTR = "data-label";
const ADDITION_WINDOW_MS = 10 * 60 * 1000;
const SECTION_TYPE_RE = /^\+([a-z][a-z-]*)$/;
const ACTIVE_EDITING_GRACE_MS = 2000;

interface ContentEditableOptions {
  content: string;
  isEditable: boolean;
  placeholderText: string;
  onChange: (content: string) => void;
  onUserInput?: () => void;
  onImageDrop?: (file: File) => Promise<{
    id: string;
    width: number;
    height: number;
    filename: string;
  }>;
  onDropComplete?: () => void;
  showWeather: boolean;
  clearWeatherFromEditor?: (editor: HTMLElement) => boolean;
}

function setCaretFromPoint(x: number, y: number): boolean {
  const selection = window.getSelection();
  if (!selection) return false;

  let range: Range | null = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else {
    const caretPositionFromPoint = (
      document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
      }
    ).caretPositionFromPoint;
    const position = caretPositionFromPoint?.(x, y);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }

  if (range) {
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }
  return false;
}

function insertNodeAtCursor(node: Node) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAtEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Get the bottom Y coordinate of the actual content in the editor.
 */
function getContentBottom(editorEl: HTMLElement): number {
  const children = Array.from(editorEl.childNodes);
  let maxBottom = editorEl.getBoundingClientRect().top;

  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];

    // Skip trailing BR elements and empty text nodes
    if (child.nodeName === "BR") continue;
    if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim())
      continue;

    if (child.nodeType === Node.ELEMENT_NODE) {
      const childRect = (child as HTMLElement).getBoundingClientRect();
      maxBottom = Math.max(maxBottom, childRect.bottom);
      break;
    } else if (child.nodeType === Node.TEXT_NODE) {
      // For text nodes, create a range to get its bounding rect
      const range = document.createRange();
      range.selectNodeContents(child);
      const rect = range.getBoundingClientRect();
      maxBottom = Math.max(maxBottom, rect.bottom);
      break;
    }
  }

  return maxBottom;
}

function createTimestampHr(timestamp: string): { hr: HTMLHRElement } {
  const hr = document.createElement("hr");
  hr.setAttribute(TIMESTAMP_ATTR, timestamp);

  const label = getTimestampLabel(timestamp);
  if (label) {
    hr.setAttribute(TIMESTAMP_LABEL_ATTR, label);
  }

  hr.setAttribute("contenteditable", "false");
  return { hr };
}

/**
 * Serialize editor DOM to canonical HTML that survives sanitizeHtml().
 * Strips derived/decorative attributes that the sanitizer would remove,
 * so the stored content matches what comes back after encrypt/decrypt.
 */
function serializeEditorContent(editor: HTMLElement): string {
  const clone = editor.cloneNode(true) as HTMLElement;
  for (const el of clone.querySelectorAll("[class]")) {
    el.removeAttribute("class");
  }
  for (const img of clone.querySelectorAll("img[data-image-id]")) {
    img.removeAttribute("src");
  }
  for (const el of clone.querySelectorAll("[data-audio-id]")) {
    if (el.getAttribute("data-audio-id") === "recording") {
      el.remove();
      continue;
    }
    // Replace runtime div with semantic <audio data-audio-id="...">
    const audioEl = document.createElement("audio");
    audioEl.setAttribute("data-audio-id", el.getAttribute("data-audio-id")!);
    el.replaceWith(audioEl);
  }
  for (const el of clone.querySelectorAll("[style]")) {
    el.removeAttribute("style");
  }
  return clone.innerHTML;
}

/**
 * Check if inserting an HR before `ref` would place it adjacent
 * to an existing HR (skipping empty text nodes and BRs).
 */
function wouldBeAdjacentToHr(ref: Node): boolean {
  let prev: Node | null = ref.previousSibling;
  while (prev) {
    if (prev.nodeName === "HR") return true;
    if (
      prev.nodeName === "BR" ||
      (prev.nodeType === Node.TEXT_NODE &&
        (prev.textContent ?? "").trim() === "")
    ) {
      prev = prev.previousSibling;
      continue;
    }
    break;
  }
  // Also check if ref itself or its next significant sibling is HR
  let next: Node | null = ref;
  while (next) {
    if (next.nodeName === "HR") return true;
    if (
      next.nodeName === "BR" ||
      (next.nodeType === Node.TEXT_NODE &&
        (next.textContent ?? "").trim() === "")
    ) {
      next = next.nextSibling;
      continue;
    }
    break;
  }
  return false;
}

function getLastEditTimestamp(element: HTMLElement): number | null {
  // Check for timestamp HR elements
  const hrs = Array.from(
    element.querySelectorAll<HTMLHRElement>(`hr[${TIMESTAMP_ATTR}]`),
  );
  if (hrs.length === 0) return null;

  const timestamps = hrs
    .map((hr) => Date.parse(hr.getAttribute(TIMESTAMP_ATTR) || ""))
    .filter((ts) => !Number.isNaN(ts));

  if (timestamps.length === 0) return null;
  return Math.max(...timestamps);
}

export function useContentEditableEditor({
  content,
  isEditable,
  placeholderText,
  onChange,
  onUserInput,
  onImageDrop,
  onDropComplete,
  showWeather,
  clearWeatherFromEditor,
}: ContentEditableOptions) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastContentRef = useRef("");
  const isLocalEditRef = useRef(false);
  const isEditableRef = useRef(isEditable);
  const onChangeRef = useRef(onChange);
  const onUserInputRef = useRef(onUserInput);
  const onImageDropRef = useRef(onImageDrop);
  const onDropCompleteRef = useRef(onDropComplete);
  const lastUserInputRef = useRef<number | null>(null);
  const lastHandleInputRef = useRef<number>(0);
  const lastEditedBlockRef = useRef<Element | null>(null);
  const hasInsertedTimestampRef = useRef(false);
  const hasAutoFocusedRef = useRef(false);
  const uploadInProgressRef = useRef(0);
  const isProgrammaticUpdateRef = useRef(false);

  const syncEditorContent = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const hasText = (el.textContent ?? "").trim().length > 0;
    const hasImages = el.querySelector("img") !== null;
    const html = hasText || hasImages ? serializeEditorContent(el) : "";
    if (html === lastContentRef.current) {
      return;
    }
    lastContentRef.current = html;
    isLocalEditRef.current = true;
    onChangeRef.current(html);
  }, []);

  useEffect(() => {
    if (showWeather) return;
    const el = editorRef.current;
    if (!el) return;
    if (clearWeatherFromEditor?.(el)) {
      syncEditorContent();
    }
  }, [content, showWeather, clearWeatherFromEditor, syncEditorContent]);

  const insertTimestampHrIfNeeded = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    // Find the block element containing the cursor
    let container = range.startContainer;
    if (container.nodeType === Node.TEXT_NODE) {
      container = container.parentNode as Node;
    }

    // Find the closest block-level element (p or div)
    let currentBlock: Element | null = null;
    let current: Node | null = container;
    while (current && current !== el) {
      if (
        current instanceof Element &&
        (current.tagName === "P" || current.tagName === "DIV")
      ) {
        currentBlock = current;
        break;
      }
      current = current.parentNode;
    }

    if (!currentBlock && el.contains(container)) {
      currentBlock = el;
    }

    // On first edit of this session, check if we need an initial timestamp.
    // Insert before the current block (where the cursor is), not at the top.
    if (lastEditedBlockRef.current === null) {
      lastEditedBlockRef.current = currentBlock;

      const now = Date.now();
      const lastEdit = getLastEditTimestamp(el);

      // Insert initial timestamp if >10min since last edit or no prior timestamps
      if (lastEdit === null || now - lastEdit > ADDITION_WINDOW_MS) {
        const timestamp = new Date(now).toISOString();
        const { hr } = createTimestampHr(timestamp);
        if (currentBlock && currentBlock !== el) {
          // Walk backwards past section headers so HR goes before the section
          let insertBefore: Element = currentBlock;
          let prev = insertBefore.previousElementSibling;
          while (prev?.hasAttribute("data-section-type")) {
            insertBefore = prev;
            prev = insertBefore.previousElementSibling;
          }
          if (!wouldBeAdjacentToHr(insertBefore)) {
            insertBefore.parentNode?.insertBefore(hr, insertBefore);
          }
        } else if (!el.firstChild || !wouldBeAdjacentToHr(el.firstChild)) {
          el.insertBefore(hr, el.firstChild);
        }
        lastUserInputRef.current = now;
        hasInsertedTimestampRef.current = true;
      }
      return;
    }

    // If we're in a different block than last time
    if (currentBlock && currentBlock !== lastEditedBlockRef.current) {
      const now = Date.now();
      const lastEdit = getLastEditTimestamp(el);

      // Check if we need to insert a timestamp (>10min since last edit, or first edit)
      if (
        !hasInsertedTimestampRef.current &&
        (lastEdit === null || now - lastEdit > ADDITION_WINDOW_MS)
      ) {
        // Check if inserting HR here would place it adjacent to an existing HR
        const insertRef =
          currentBlock === el ? el.firstChild : currentBlock;

        if (insertRef && !wouldBeAdjacentToHr(insertRef)) {
          const timestamp = new Date(now).toISOString();
          const { hr } = createTimestampHr(timestamp);

          if (currentBlock === el) {
            el.insertBefore(hr, el.firstChild);
          } else {
            // Walk backwards past section header+body pairs so the HR
            // is inserted before the section, not inside it.
            let insertBefore: Element = currentBlock;
            let prev = insertBefore.previousElementSibling;
            while (prev?.hasAttribute("data-section-type")) {
              insertBefore = prev;
              prev = insertBefore.previousElementSibling;
            }

            // Wrap any preceding inline content in a div before inserting hr
            const nodesToWrap: Node[] = [];
            let node = insertBefore.previousSibling;
            while (node) {
              if (
                node instanceof HTMLHRElement ||
                (node instanceof HTMLElement &&
                  (node.tagName === "DIV" || node.tagName === "P"))
              ) {
                break;
              }
              nodesToWrap.unshift(node);
              node = node.previousSibling;
            }
            if (nodesToWrap.length > 0) {
              const wrapper = document.createElement("div");
              nodesToWrap[0].parentNode?.insertBefore(wrapper, nodesToWrap[0]);
              for (const n of nodesToWrap) {
                wrapper.appendChild(n);
              }
            }

            // Insert before the section header (or current block)
            if (!wouldBeAdjacentToHr(insertBefore)) {
              insertBefore.parentNode?.insertBefore(hr, insertBefore);
            }
          }

          lastUserInputRef.current = now;
        }
        hasInsertedTimestampRef.current = true;
      }

      lastEditedBlockRef.current = currentBlock;
    }
  }, []);

  const updateTimestampLabels = useCallback((element?: HTMLElement) => {
    const el = element ?? editorRef.current;
    if (!el) return;

    const hrs = Array.from(
      el.querySelectorAll<HTMLHRElement>(`hr[${TIMESTAMP_ATTR}]`),
    );
    for (const hr of hrs) {
      const timestamp = hr.getAttribute(TIMESTAMP_ATTR);
      if (!timestamp) continue;

      const label = getTimestampLabel(timestamp);
      if (label) {
        if (hr.getAttribute(TIMESTAMP_LABEL_ATTR) !== label) {
          hr.setAttribute(TIMESTAMP_LABEL_ATTR, label);
        }
      } else {
        hr.removeAttribute(TIMESTAMP_LABEL_ATTR);
      }
    }
  }, []);

  const updateEmptyState = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const hasText = (el.textContent ?? "").trim().length > 0;
    const hasImages = el.querySelector("img") !== null;
    const hasHr = el.querySelector("hr") !== null;
    if (!hasText && !hasImages && !hasHr) {
      el.setAttribute("data-empty", "true");
    } else {
      el.removeAttribute("data-empty");
    }
  }, []);

  const processManualHrs = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    // Find all HRs without timestamps (manually inserted)
    const untimestampedHrs = Array.from(
      el.querySelectorAll<HTMLHRElement>(`hr:not([${TIMESTAMP_ATTR}])`),
    );

    for (const hr of untimestampedHrs) {
      // Add timestamp
      const timestamp = new Date().toISOString();
      hr.setAttribute(TIMESTAMP_ATTR, timestamp);
      const label = getTimestampLabel(timestamp);
      if (label) {
        hr.setAttribute(TIMESTAMP_LABEL_ATTR, label);
      }
      hr.setAttribute("contenteditable", "false");

      // Ensure there's a newline after the HR
      const nextSibling = hr.nextSibling;

      // Check if we need to add a BR
      // Add BR if: no next sibling, empty text node, or another HR
      const needsBr =
        !nextSibling ||
        (nextSibling.nodeType === Node.TEXT_NODE &&
          nextSibling.textContent?.trim() === "") ||
        (nextSibling.nodeType === Node.ELEMENT_NODE &&
          nextSibling.nodeName === "HR") ||
        (nextSibling.nodeType === Node.ELEMENT_NODE &&
          nextSibling.nodeName !== "BR");

      if (needsBr) {
        const br = document.createElement("br");
        if (
          nextSibling?.nodeType === Node.TEXT_NODE &&
          nextSibling.textContent?.trim() === ""
        ) {
          // Replace empty text node with BR
          hr.parentNode?.replaceChild(br, nextSibling);
        } else {
          // Insert BR after HR
          hr.parentNode?.insertBefore(br, nextSibling || null);
        }

        // Place cursor after the BR
        setTimeout(() => {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStartAfter(br);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }, 0);
      }
    }
  }, []);

  useEffect(() => {
    isEditableRef.current = isEditable;
  }, [isEditable]);

  useEffect(() => {
    onChangeRef.current = onChange;
    onUserInputRef.current = onUserInput;
    onImageDropRef.current = onImageDrop;
    onDropCompleteRef.current = onDropComplete;
  }, [onChange, onUserInput, onImageDrop, onDropComplete]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.setAttribute("data-placeholder", placeholderText);
  }, [placeholderText]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Skip innerHTML update if this content change came from local user input
    // This prevents scroll jumps on mobile caused by re-setting innerHTML
    if (isLocalEditRef.current) {
      isLocalEditRef.current = false;
      lastContentRef.current = content || "";
      updateEmptyState();
      return;
    }
    // Skip external content reset while images are uploading to avoid
    // disconnecting placeholder elements from the DOM
    if (uploadInProgressRef.current > 0) {
      return;
    }
    // Skip external updates while user is actively editing to prevent
    // stale async reads (reloadFromLocal/refreshFromRemote) from
    // overwriting the DOM and jumping the cursor.
    if (
      lastHandleInputRef.current &&
      Date.now() - lastHandleInputRef.current < ACTIVE_EDITING_GRACE_MS
    ) {
      return;
    }
    if (content === lastContentRef.current) {
      updateEmptyState();
      updateTimestampLabels(el);
      applySectionColors(el);
      return;
    }
    const nextContent = content || "";
    if (nextContent === el.innerHTML) {
      lastContentRef.current = nextContent;
      updateEmptyState();
      updateTimestampLabels(el);
      applySectionColors(el);
      return;
    }
    // Save cursor as a path so it survives DOM replacement
    const savedCursor = saveResilientCursorPosition(el);
    // Guard against synthetic input/beforeinput events that mobile
    // browsers may fire when innerHTML is set programmatically.
    isProgrammaticUpdateRef.current = true;
    el.innerHTML = nextContent; // Sanitized content from our own store
    lastContentRef.current = nextContent;
    // Reset stale DOM ref — old nodes are detached after innerHTML set
    lastEditedBlockRef.current = null;
    updateEmptyState();
    updateTimestampLabels(el);
    applySectionColors(el);
    restoreResilientCursorPosition(el, savedCursor);
    isProgrammaticUpdateRef.current = false;
  }, [content, updateEmptyState, updateTimestampLabels]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!isEditable) {
      hasAutoFocusedRef.current = false;
      return;
    }
    if (hasAutoFocusedRef.current) return;

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const hasContent = content.trim().length > 0;
    if (isMobile && hasContent) {
      hasAutoFocusedRef.current = true;
      // Prime lastEditedBlockRef so first mobile tap doesn't trigger
      // the "first edit of session" path and insert HR at wrong position
      const blocks = el.querySelectorAll("p, div");
      const lastBlock = blocks[blocks.length - 1];
      lastEditedBlockRef.current = lastBlock ?? el;
      return;
    }

    el.focus();
    const hasText = (el.textContent ?? "").trim().length > 0;
    const hasImages = el.querySelector("img") !== null;
    if (hasText || hasImages) {
      placeCaretAtEnd(el);

      // Prime lastEditedBlockRef to the last block element.
      // This ensures that if the user presses Enter to create a new block,
      // it will be detected as a block change (enabling timestamp insertion).
      // Look for the last P or DIV, not just the last child (which might be an HR).
      const blocks = el.querySelectorAll("p, div");
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock) {
        lastEditedBlockRef.current = lastBlock;
      } else {
        // No blocks found, use the editor itself as fallback
        // This prevents the first-edit path from inserting at the beginning
        lastEditedBlockRef.current = el;
      }
    }
    hasAutoFocusedRef.current = true;
  }, [content, isEditable]);

  const handleInput = useCallback(() => {
    if (!isEditableRef.current) return;
    // Skip synthetic input events fired by mobile browsers after
    // programmatic innerHTML updates in the content sync effect.
    if (isProgrammaticUpdateRef.current) return;
    const el = editorRef.current;
    if (!el) return;

    const now = Date.now();
    lastHandleInputRef.current = now;
    if (
      lastUserInputRef.current &&
      now - lastUserInputRef.current > ADDITION_WINDOW_MS
    ) {
      // More than 10 minutes passed, allow inserting timestamp on next block change
      hasInsertedTimestampRef.current = false;
    }

    // Check if we should insert a timestamp for this edit
    insertTimestampHrIfNeeded();

    // Track last user input time
    lastUserInputRef.current = now;

    updateEmptyState();

    // Process any manually inserted HRs (add timestamps and newlines)
    processManualHrs();

    // Apply text transforms (HR insertion, linkify) with cursor preservation
    applyTextTransforms(el);

    // Apply section header colors
    applySectionColors(el);

    // Clean up stale section headers whose text no longer matches +typename
    const sectionHeaders = el.querySelectorAll<HTMLElement>("[data-section-type]");
    for (const header of sectionHeaders) {
      const text = (header.textContent ?? "").trim();
      if (!text.match(/^\+[a-z][a-z-]*$/)) {
        header.removeAttribute("data-section-type");
        for (let i = 0; i < 8; i++) {
          header.classList.remove(`section-hue-${i}`);
        }
      }
    }

    const hasText = (el.textContent ?? "").trim().length > 0;
    const hasImages = el.querySelector("img") !== null;
    const html = hasText || hasImages ? serializeEditorContent(el) : "";
    if (html === lastContentRef.current) {
      return;
    }
    lastContentRef.current = html;
    isLocalEditRef.current = true;
    updateTimestampLabels(el);
    onChangeRef.current(html);
    onUserInputRef.current?.();
  }, [
    insertTimestampHrIfNeeded,
    processManualHrs,
    updateEmptyState,
    updateTimestampLabels,
  ]);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!isEditableRef.current) return;
      const dropHandler = onImageDropRef.current;
      if (!dropHandler || !event.clipboardData) return;

      const items = Array.from(event.clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      event.preventDefault();

      const placeholder = document.createElement("img");
      placeholder.setAttribute("data-image-id", "uploading");
      placeholder.setAttribute("alt", "Uploading...");
      insertNodeAtCursor(placeholder);
      handleInput();

      uploadInProgressRef.current++;
      dropHandler(file)
        .then(({ id, width, height, filename }) => {
          placeholder.setAttribute("data-image-id", id);
          placeholder.setAttribute("alt", filename);
          placeholder.setAttribute("width", String(width));
          placeholder.setAttribute("height", String(height));
        })
        .catch((error) => {
          console.error("Failed to upload pasted image:", error);
          placeholder.remove();
        })
        .finally(() => {
          uploadInProgressRef.current--;
          onDropCompleteRef.current?.();
          updateEmptyState();
          handleInput();
        });
    },
    [handleInput, updateEmptyState],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!isEditableRef.current) return;
      const dropHandler = onImageDropRef.current;
      const files = event.dataTransfer?.files;
      if (!dropHandler || !files || files.length === 0) return;

      const file = files[0];
      if (!file.type.startsWith("image/")) return;

      event.preventDefault();

      const el = editorRef.current;
      if (!el) return;

      // Check if drop is below the content - if so, place caret at end
      const contentBottom = getContentBottom(el);
      if (event.clientY > contentBottom) {
        placeCaretAtEnd(el);
      } else {
        // Try to set caret from drop point, fall back to end of editor
        const caretSet = setCaretFromPoint(event.clientX, event.clientY);
        if (!caretSet) {
          placeCaretAtEnd(el);
        }
      }

      const placeholder = document.createElement("img");
      placeholder.setAttribute("data-image-id", "uploading");
      placeholder.setAttribute("alt", "Uploading...");
      const previewUrl = URL.createObjectURL(file);
      placeholder.setAttribute("src", previewUrl);
      insertNodeAtCursor(placeholder);
      handleInput();

      uploadInProgressRef.current++;
      dropHandler(file)
        .then(({ id, width, height, filename }) => {
          const finalImage = document.createElement("img");
          finalImage.setAttribute("data-image-id", id);
          finalImage.setAttribute("alt", filename);
          finalImage.setAttribute("width", String(width));
          finalImage.setAttribute("height", String(height));
          if (placeholder.isConnected) {
            placeholder.replaceWith(finalImage);
          }
        })
        .catch((error) => {
          console.error("Failed to upload dropped image:", error);
          placeholder.remove();
        })
        .finally(() => {
          uploadInProgressRef.current--;
          URL.revokeObjectURL(previewUrl);
          onDropCompleteRef.current?.();
          updateEmptyState();
          handleInput();
        });
    },
    [handleInput, updateEmptyState],
  );

  const handleFileInput = useCallback(
    (file: File) => {
      if (!isEditableRef.current) return;
      const dropHandler = onImageDropRef.current;
      if (!dropHandler) return;

      const el = editorRef.current;
      if (!el) return;

      el.focus();
      placeCaretAtEnd(el);

      const placeholder = document.createElement("img");
      placeholder.setAttribute("data-image-id", "uploading");
      placeholder.setAttribute("alt", "Uploading...");
      const previewUrl = URL.createObjectURL(file);
      placeholder.setAttribute("src", previewUrl);
      insertNodeAtCursor(placeholder);
      handleInput();

      uploadInProgressRef.current++;
      dropHandler(file)
        .then(({ id, width, height, filename }) => {
          const finalImage = document.createElement("img");
          finalImage.setAttribute("data-image-id", id);
          finalImage.setAttribute("alt", filename);
          finalImage.setAttribute("width", String(width));
          finalImage.setAttribute("height", String(height));
          if (placeholder.isConnected) {
            placeholder.replaceWith(finalImage);
          }
        })
        .catch((error) => {
          console.error("Failed to upload image:", error);
          placeholder.remove();
        })
        .finally(() => {
          uploadInProgressRef.current--;
          URL.revokeObjectURL(previewUrl);
          onDropCompleteRef.current?.();
          updateEmptyState();
          handleInput();
        });
    },
    [handleInput, updateEmptyState],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isEditableRef.current) return;
    if (!onImageDropRef.current) return;
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
    }
  }, []);

  const handleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    // Handle anchor clicks
    const anchor = target.closest("a");
    if (anchor && anchor.href) {
      event.preventDefault();
      window.open(anchor.href, "_blank", "noopener,noreferrer");
      return;
    }

  }, []);

  // Section transform via beforeinput — mobile keyboards don't
  // fire keydown for Enter, but beforeinput fires reliably.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const handleBeforeInput = (event: InputEvent) => {
      if (!isEditableRef.current) return;
      if (isProgrammaticUpdateRef.current) return;
      if (
        event.inputType !== "insertParagraph" &&
        event.inputType !== "insertLineBreak"
      ) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      let container: Node | null = range.startContainer;
      const textNode =
        container.nodeType === Node.TEXT_NODE ? container : null;
      if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentNode;
      }

      let block: HTMLElement | null = null;
      let current: Node | null = container;
      while (current && current !== el) {
        if (
          current instanceof HTMLElement &&
          (current.tagName === "DIV" || current.tagName === "P")
        ) {
          block = current;
          break;
        }
        current = current.parentNode;
      }

      // Bare text node directly inside editor — wrap in div first
      if (!block && container === el) {
        const targetNode = textNode ?? (() => {
          for (const child of Array.from(el.childNodes)) {
            if (
              child.nodeType === Node.TEXT_NODE &&
              (child.textContent ?? "").trim().match(SECTION_TYPE_RE)
            ) {
              return child;
            }
          }
          return null;
        })();
        if (targetNode && targetNode.parentNode === el) {
          const text = (targetNode.textContent ?? "").trim();
          if (text.match(SECTION_TYPE_RE)) {
            const wrapper = document.createElement("div");
            el.insertBefore(wrapper, targetNode);
            wrapper.appendChild(targetNode);
            block = wrapper;
          }
        }
      }

      if (!block) return;

      const text = (block.textContent ?? "").trim();
      const match = text.match(SECTION_TYPE_RE);
      if (!match) return;

      event.preventDefault();
      const typeName = match[1];
      block.setAttribute("data-section-type", typeName);
      block.textContent = "+" + typeName;

      const body = document.createElement("div");
      body.appendChild(document.createElement("br"));
      block.parentNode?.insertBefore(body, block.nextSibling);

      applySectionColors(el);

      const sel = window.getSelection();
      if (sel) {
        const r = document.createRange();
        r.setStart(body, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }

      const html = serializeEditorContent(el);
      lastContentRef.current = html;
      isLocalEditRef.current = true;
      onChangeRef.current(html);
      onUserInputRef.current?.();
    };

    el.addEventListener("beforeinput", handleBeforeInput);
    return () => {
      el.removeEventListener("beforeinput", handleBeforeInput);
    };
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!isEditableRef.current) return;

    // Normalize Shift+Enter to insertLineBreak for cross-browser consistency
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      document.execCommand("insertLineBreak");
      return;
    }

    // Delegate to hotkey service
    hotkeyHandleKeyDown(event.nativeEvent);
  }, []);

  return {
    editorRef,
    handleInput,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleClick,
    handleKeyDown,
    handleFileInput,
  };
}
