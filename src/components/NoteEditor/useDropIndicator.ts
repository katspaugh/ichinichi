import { useCallback, useRef, useState } from "react";
import type { DragEvent, RefObject } from "react";

export interface DropIndicatorPosition {
  top: number;
  left: number;
  width: number;
}

interface UseDropIndicatorOptions {
  editorRef: RefObject<HTMLDivElement | null>;
  isEditable: boolean;
  isDraggingImage: boolean;
}

/**
 * Find the nearest block-level child of the editor at the given Y position.
 * Returns the block and whether the indicator should appear before or after it.
 */
function findBlockAtY(
  editorEl: HTMLElement,
  clientY: number,
): { block: Element; position: "before" | "after" } | null {
  const children = Array.from(editorEl.children);

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const rect = child.getBoundingClientRect();

    // Skip elements with no height
    if (rect.height === 0) continue;

    // Check if Y is within this element's vertical bounds
    if (clientY >= rect.top && clientY <= rect.bottom) {
      // Determine if we're in the top or bottom half
      const midpoint = rect.top + rect.height / 2;
      const position = clientY < midpoint ? "before" : "after";
      return { block: child, position };
    }

    // If Y is above this element, indicator goes before it
    if (clientY < rect.top) {
      return { block: child, position: "before" };
    }
  }

  // Y is below all elements - return last block with "after"
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (child.getBoundingClientRect().height > 0) {
      return { block: child, position: "after" };
    }
  }

  return null;
}

/**
 * For direct text nodes in the editor (not wrapped in blocks),
 * find a text node range at the given Y position.
 */
function findTextNodeAtY(
  editorEl: HTMLElement,
  clientY: number,
): { top: number; bottom: number } | null {
  const children = Array.from(editorEl.childNodes);

  for (const child of children) {
    if (child.nodeType !== Node.TEXT_NODE) continue;
    if (!child.textContent?.trim()) continue;

    const range = document.createRange();
    range.selectNodeContents(child);
    const rect = range.getBoundingClientRect();

    if (rect.height === 0) continue;

    if (clientY >= rect.top && clientY <= rect.bottom) {
      return { top: rect.top, bottom: rect.bottom };
    }
  }

  return null;
}

/**
 * Get the position for the indicator at the end of the editor content.
 */
function getEndOfContentPosition(
  editorEl: HTMLElement,
): DropIndicatorPosition | null {
  const editorRect = editorEl.getBoundingClientRect();
  const children = Array.from(editorEl.childNodes);

  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];

    // Skip BR elements and empty text nodes
    if (child.nodeName === "BR") continue;
    if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim())
      continue;

    if (child.nodeType === Node.ELEMENT_NODE) {
      const childRect = (child as HTMLElement).getBoundingClientRect();
      return {
        top: childRect.bottom,
        left: editorRect.left,
        width: editorRect.width,
      };
    } else if (child.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      range.selectNodeContents(child);
      const rect = range.getBoundingClientRect();
      return {
        top: rect.bottom,
        left: editorRect.left,
        width: editorRect.width,
      };
    }
  }

  return {
    top: editorRect.top,
    left: editorRect.left,
    width: editorRect.width,
  };
}

/**
 * Get the bottom Y coordinate of the actual content in the editor.
 */
function getContentBottom(editorEl: HTMLElement): number {
  const children = Array.from(editorEl.childNodes);
  let maxBottom = editorEl.getBoundingClientRect().top;

  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];

    if (child.nodeName === "BR") continue;
    if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim())
      continue;

    if (child.nodeType === Node.ELEMENT_NODE) {
      const childRect = (child as HTMLElement).getBoundingClientRect();
      maxBottom = Math.max(maxBottom, childRect.bottom);
      break;
    } else if (child.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      range.selectNodeContents(child);
      const rect = range.getBoundingClientRect();
      maxBottom = Math.max(maxBottom, rect.bottom);
      break;
    }
  }

  return maxBottom;
}

export function useDropIndicator({
  editorRef,
  isEditable,
  isDraggingImage,
}: UseDropIndicatorOptions) {
  const [rawIndicatorPosition, setIndicatorPosition] =
    useState<DropIndicatorPosition | null>(null);
  const lastUpdateRef = useRef(0);

  const updateIndicator = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!isEditable || !isDraggingImage) {
        setIndicatorPosition(null);
        return;
      }

      const editorEl = editorRef.current;
      if (!editorEl) return;

      // Throttle updates
      const now = Date.now();
      if (now - lastUpdateRef.current < 16) return;
      lastUpdateRef.current = now;

      const editorRect = editorEl.getBoundingClientRect();

      // Check if mouse is within editor horizontal bounds
      if (event.clientX < editorRect.left || event.clientX > editorRect.right) {
        setIndicatorPosition(null);
        return;
      }

      // Check if mouse is below all content
      const contentBottom = getContentBottom(editorEl);
      if (event.clientY > contentBottom) {
        const endPosition = getEndOfContentPosition(editorEl);
        setIndicatorPosition(endPosition);
        return;
      }

      // Check if mouse is above all content
      if (event.clientY < editorRect.top) {
        setIndicatorPosition(null);
        return;
      }

      // Find the block element at this Y position
      const blockInfo = findBlockAtY(editorEl, event.clientY);

      if (blockInfo) {
        const blockRect = blockInfo.block.getBoundingClientRect();
        const top =
          blockInfo.position === "before" ? blockRect.top : blockRect.bottom;

        setIndicatorPosition({
          top,
          left: editorRect.left,
          width: editorRect.width,
        });
        return;
      }

      // Check for direct text nodes (not wrapped in elements)
      const textInfo = findTextNodeAtY(editorEl, event.clientY);
      if (textInfo) {
        // For unwrapped text, show indicator at bottom of the text block
        // (we can't insert between wrapped lines of the same text node)
        const midpoint = (textInfo.top + textInfo.bottom) / 2;
        const top = event.clientY < midpoint ? textInfo.top : textInfo.bottom;

        setIndicatorPosition({
          top,
          left: editorRect.left,
          width: editorRect.width,
        });
        return;
      }

      // Fallback to end position
      const endPosition = getEndOfContentPosition(editorEl);
      setIndicatorPosition(endPosition);
    },
    [editorRef, isEditable, isDraggingImage],
  );

  const clearIndicator = useCallback(() => {
    setIndicatorPosition(null);
  }, []);

  return {
    indicatorPosition: isDraggingImage ? rawIndicatorPosition : null,
    updateIndicator,
    clearIndicator,
  };
}
