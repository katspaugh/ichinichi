import TurndownService from "turndown";
import { zipSync, strToU8 } from "fflate";
import type { NoteRepository } from "../storage/noteRepository";

/**
 * Convert DD-MM-YYYY to YYYY-MM-DD for filenames.
 */
export function dateToFilename(date: string): string {
  const [dd, mm, yyyy] = date.split("-");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Create a turndown instance with custom rules for
 * timestamp HRs and section labels.
 */
export function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
  });

  td.addRule("timestampHr", {
    filter(node) {
      return (
        node.nodeName === "HR" &&
        node.hasAttribute("data-timestamp")
      );
    },
    replacement(_content, node) {
      const el = node as HTMLElement;
      const label = el.getAttribute("data-label") ?? "";
      return label
        ? `\n\n---\n<!-- time: ${label} -->\n\n`
        : "\n\n---\n\n";
    },
  });

  td.addRule("sectionLabel", {
    filter(node) {
      return (
        node.nodeType === 1 &&
        (node as HTMLElement).hasAttribute("data-section-type")
      );
    },
    replacement(content) {
      return `\n\n## ${content.trim()}\n\n`;
    },
  });

  td.addRule("imagePlaceholder", {
    filter(node) {
      return (
        node.nodeName === "IMG" &&
        node.hasAttribute("data-image-id")
      );
    },
    replacement(_content, node) {
      const id = (node as HTMLElement).getAttribute("data-image-id");
      return `<!-- image: ${id} -->`;
    },
  });

  return td;
}

/**
 * Convert note HTML to markdown.
 */
export function htmlToMarkdown(
  html: string,
  turndown: TurndownService,
): string {
  return turndown.turndown(html).trim();
}

export interface ExportProgress {
  phase: "fetching" | "converting" | "zipping";
  current: number;
  total: number;
}

/**
 * Export all notes as a zip of markdown files.
 * Returns the zip blob for download.
 */
export async function exportNotesAsZip(
  repository: NoteRepository,
  onProgress?: (progress: ExportProgress) => void,
): Promise<Blob | null> {
  const datesResult = await repository.getAllDates();
  if (!datesResult.ok) {
    throw new Error(
      `Failed to fetch note dates: ${datesResult.error.type}`,
    );
  }

  const dates = datesResult.value;
  if (dates.length === 0) return null;

  const total = dates.length;
  const files: Record<string, Uint8Array> = {};
  const turndown = createTurndown();

  for (let i = 0; i < dates.length; i++) {
    onProgress?.({ phase: "fetching", current: i + 1, total });

    const noteResult = await repository.get(dates[i]);
    if (!noteResult.ok || !noteResult.value) continue;

    const md = htmlToMarkdown(noteResult.value.content, turndown);
    if (!md) continue;

    const filename = `${dateToFilename(dates[i])}.md`;
    files[filename] = strToU8(md);
  }

  if (Object.keys(files).length === 0) return null;

  onProgress?.({
    phase: "zipping",
    current: total,
    total,
  });

  const zipped = zipSync(files);
  return new Blob([zipped.buffer as ArrayBuffer], {
    type: "application/zip",
  });
}

/**
 * Trigger browser download of a blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
