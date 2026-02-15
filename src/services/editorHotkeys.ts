/**
 * Editor Hotkey Service
 * Maps keyboard shortcuts to execCommand calls.
 */

function toggleInlineCode(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  // Check if cursor/selection is inside a <code> element
  let codeAncestor: HTMLElement | null = null;
  let node: HTMLElement | null =
    range.commonAncestorContainer instanceof HTMLElement
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  while (node) {
    if (node.tagName === "CODE") { codeAncestor = node; break; }
    node = node.parentElement;
  }

  if (codeAncestor) {
    // Unwrap: select the entire <code> element and replace with its text
    const unwrapRange = document.createRange();
    unwrapRange.selectNode(codeAncestor);
    selection.removeAllRanges();
    selection.addRange(unwrapRange);
    document.execCommand("insertHTML", false, codeAncestor.textContent ?? "");
  } else if (range.collapsed) {
    // No selection: insert empty <code> with zero-width space to place cursor inside
    document.execCommand("insertHTML", false, "<code>\u200B</code>");
  } else {
    // Wrap selected text in <code>
    const text = range.toString();
    document.execCommand("insertHTML", false, `<code>${text}</code>`);
  }
}

/**
 * Handle keydown events for custom hotkeys.
 * Returns true if the event was handled.
 */
export function handleKeyDown(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();

  // Cmd+Shift+X or Ctrl+Shift+X for strikethrough
  if (key === "x" && (event.metaKey || event.ctrlKey) && event.shiftKey) {
    event.preventDefault();
    document.execCommand("strikeThrough", false);
    return true;
  }

  // Cmd+B or Ctrl+B for bold
  if (key === "b" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
    event.preventDefault();
    document.execCommand("bold", false);
    return true;
  }

  // Cmd+I or Ctrl+I for italic
  if (key === "i" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
    event.preventDefault();
    document.execCommand("italic", false);
    return true;
  }

  // Cmd+U or Ctrl+U for underline
  if (key === "u" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
    event.preventDefault();
    document.execCommand("underline", false);
    return true;
  }

  // Cmd+Shift+M or Ctrl+Shift+M for inline code (toggle)
  if (key === "m" && (event.metaKey || event.ctrlKey) && event.shiftKey) {
    event.preventDefault();
    toggleInlineCode();
    return true;
  }


  return false;
}
