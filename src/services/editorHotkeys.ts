/**
 * Editor Hotkey Service
 * Maps keyboard shortcuts to execCommand calls.
 */

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

  return false;
}
