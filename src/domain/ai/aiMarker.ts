/**
 * Strips and injects <mark data-ai-type="..."> spans in HTML content.
 */

import type { AiEvent } from "./aiTypes";

/**
 * Remove all <mark data-ai-type="..."> wrappers but keep their inner text.
 * Uses regex replacement to strip the opening and closing mark tags.
 */
export function stripAiMarks(html: string): string {
  return html
    .replace(/<mark data-ai-type="[^"]*">/g, "")
    .replace(/<\/mark>/g, "");
}

/**
 * Injects <mark data-ai-type="..."> elements around the first occurrence
 * of each event's text in the HTML content.
 *
 * Uses a DOM TreeWalker approach to find exact matches within single text nodes,
 * avoiding matches that span across tag boundaries.
 *
 * Events are sorted by text length descending (longest first) to avoid
 * substring conflicts.
 */
export function injectAiMarks(html: string, events: AiEvent[]): string {
  const stripped = stripAiMarks(html);

  if (events.length === 0) {
    return stripped;
  }

  // safe: temporary detached element used only for HTML parsing, never inserted into DOM
  const div = document.createElement("div");
  div.innerHTML = stripped;

  const sorted = [...events].sort((a, b) => b.text.length - a.text.length);
  const marked = new Set<string>();

  for (const event of sorted) {
    if (marked.has(event.text)) {
      continue;
    }

    const walker = document.createTreeWalker(
      div,
      NodeFilter.SHOW_TEXT,
    );

    let node: Text | null;
    let found = false;

    while (!found && (node = walker.nextNode() as Text | null)) {
      const content = node.nodeValue ?? "";
      const index = content.indexOf(event.text);

      if (index === -1) {
        continue;
      }

      const before = content.substring(0, index);
      const after = content.substring(index + event.text.length);
      const parent = node.parentNode!;

      const mark = document.createElement("mark");
      mark.setAttribute("data-ai-type", event.type);
      mark.textContent = event.text;

      if (before) {
        parent.insertBefore(document.createTextNode(before), node);
      }

      parent.insertBefore(mark, node);

      if (after) {
        parent.insertBefore(document.createTextNode(after), node);
      }

      parent.removeChild(node);
      marked.add(event.text);
      found = true;
    }
  }

  return div.innerHTML;
}
