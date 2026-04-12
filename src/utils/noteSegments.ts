const TIMESTAMP_ATTR = "data-timestamp";
const LABEL_ATTR = "data-label";

export interface NoteSegment {
  id: string;
  timestamp: string | null;
  label: string | null;
  html: string;
}

export function parseNoteSegments(html: string): NoteSegment[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const container = doc.body.firstElementChild!;

  const segments: NoteSegment[] = [];
  let currentHtml = "";
  let currentTimestamp: string | null = null;
  let currentLabel: string | null = null;

  for (const child of Array.from(container.childNodes)) {
    const isTimestampHr =
      child instanceof HTMLHRElement && child.hasAttribute(TIMESTAMP_ATTR);

    if (isTimestampHr) {
      // Flush accumulated content as a segment
      if (currentTimestamp !== null || currentHtml.trim()) {
        segments.push({
          id: currentTimestamp ?? "preamble",
          timestamp: currentTimestamp,
          label: currentLabel,
          html: currentHtml,
        });
      }
      currentTimestamp = child.getAttribute(TIMESTAMP_ATTR);
      currentLabel = child.getAttribute(LABEL_ATTR);
      currentHtml = "";
    } else {
      if (child instanceof Element) {
        currentHtml += child.outerHTML;
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent) {
        currentHtml += child.textContent;
      }
    }
  }

  // Flush last segment
  if (currentTimestamp !== null || currentHtml.trim()) {
    segments.push({
      id: currentTimestamp ?? "preamble",
      timestamp: currentTimestamp,
      label: currentLabel,
      html: currentHtml,
    });
  }

  return segments;
}

export function assembleSegments(segments: NoteSegment[]): string {
  if (segments.length === 0) return "";

  return segments
    .map((seg) => {
      if (seg.timestamp) {
        const labelAttr = seg.label ? ` ${LABEL_ATTR}="${seg.label}"` : "";
        return `<hr ${TIMESTAMP_ATTR}="${seg.timestamp}"${labelAttr} contenteditable="false">${seg.html}`;
      }
      return seg.html;
    })
    .join("");
}
