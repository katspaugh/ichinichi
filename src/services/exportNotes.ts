import TurndownService from "turndown";
import { zipSync, strToU8 } from "fflate";
import type { NoteRepository } from "../storage/noteRepository";
import type { LegacyDataSource } from "../storage/legacyMigration";
import { decryptLegacyNotes } from "../storage/legacyMigration";
import type { E2eeService } from "../domain/crypto/e2eeService";

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
 * Convert decrypted legacy IDB notes into a `{ filename → markdown }` map.
 * Used as an additional source when exporting so data from the pre-RxDB
 * `dailynotes-unified` database is recoverable even if migration hasn't run.
 */
export async function collectLegacyMarkdown(
  source: LegacyDataSource,
  e2ee: E2eeService,
): Promise<Record<string, string>> {
  const turndown = createTurndown();
  const notes = await decryptLegacyNotes(source, e2ee);
  const files: Record<string, string> = {};
  for (const note of notes) {
    const md = htmlToMarkdown(note.content, turndown);
    if (!md) continue;
    files[`${dateToFilename(note.date)}.md`] = md;
  }
  return files;
}

/**
 * Export all notes as a zip of markdown files.
 * Returns the zip blob for download.
 *
 * When `legacyExtras` is provided, entries not already in the repository are
 * merged in (repository data takes precedence for duplicate dates). This is
 * the recovery path for notes still sitting in the legacy IDB that for any
 * reason haven't been migrated into RxDB yet.
 */
export async function exportNotesAsZip(
  repository: NoteRepository,
  onProgress?: (progress: ExportProgress) => void,
  legacyExtras?: Record<string, string>,
): Promise<Blob | null> {
  const datesResult = await repository.getAllDates();
  if (!datesResult.ok) {
    throw new Error(
      `Failed to fetch note dates: ${datesResult.error.type}`,
    );
  }

  const dates = datesResult.value;
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

  if (legacyExtras) {
    for (const [filename, md] of Object.entries(legacyExtras)) {
      if (filename in files) continue;
      files[filename] = strToU8(md);
    }
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
