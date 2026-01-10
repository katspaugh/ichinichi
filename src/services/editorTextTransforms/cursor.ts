/**
 * Cursor position utilities for text transformations.
 */

export interface CursorPosition {
  node: Node;
  offset: number;
}

/**
 * Save the current cursor position within an element.
 */
export function saveCursorPosition(
  element: HTMLElement,
): CursorPosition | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return null;
  return { node: range.startContainer, offset: range.startOffset };
}

/**
 * Restore a previously saved cursor position.
 */
export function restoreCursorPosition(
  element: HTMLElement,
  saved: CursorPosition | null,
): void {
  if (!saved) return;
  const selection = window.getSelection();
  if (!selection) return;

  if (element.contains(saved.node)) {
    try {
      const range = document.createRange();
      const maxOffset = saved.node.textContent?.length ?? 0;
      range.setStart(saved.node, Math.min(saved.offset, maxOffset));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {
      placeCursorAtEnd(element);
    }
  }
}

/**
 * Place cursor at the end of an element.
 */
export function placeCursorAtEnd(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Place cursor immediately after an element.
 */
export function placeCursorAfterElement(element: Element): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStartAfter(element);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
