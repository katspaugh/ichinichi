// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  dateToFilename,
  createTurndown,
  htmlToMarkdown,
  exportNotesAsZip,
} from "../services/exportNotes";
import { ok, err } from "../domain/result";
import type { NoteRepository } from "../storage/noteRepository";

describe("dateToFilename", () => {
  it("converts DD-MM-YYYY to YYYY-MM-DD", () => {
    expect(dateToFilename("16-03-2026")).toBe("2026-03-16");
    expect(dateToFilename("01-01-2020")).toBe("2020-01-01");
    expect(dateToFilename("31-12-1999")).toBe("1999-12-31");
  });
});

describe("htmlToMarkdown", () => {
  const td = createTurndown();

  it("converts basic text", () => {
    expect(htmlToMarkdown("<p>Hello world</p>", td)).toBe("Hello world");
  });

  it("converts bold and italic", () => {
    expect(htmlToMarkdown("<b>bold</b>", td)).toBe("**bold**");
    expect(htmlToMarkdown("<i>italic</i>", td)).toBe("_italic_");
  });

  it("converts links", () => {
    expect(
      htmlToMarkdown(
        '<a href="https://example.com">link</a>',
        td,
      ),
    ).toBe("[link](https://example.com)");
  });

  it("converts timestamp HR to markdown HR with time comment", () => {
    const html =
      '<hr data-timestamp="2026-03-04T07:06:25.486Z" data-label="8:06 AM" contenteditable="false">';
    const result = htmlToMarkdown(html, td);
    expect(result).toContain("---");
    expect(result).toContain("<!-- time: 8:06 AM -->");
  });

  it("converts timestamp HR without label to plain HR", () => {
    const html = '<hr data-timestamp="2026-03-04T07:06:25.486Z">';
    const result = htmlToMarkdown(html, td);
    expect(result).toBe("---");
  });

  it("converts section label to h2", () => {
    const html = '<div data-section-type="trumpet">+trumpet</div>';
    const result = htmlToMarkdown(html, td);
    expect(result).toBe("## +trumpet");
  });

  it("converts image placeholder", () => {
    const html = '<img data-image-id="abc123">';
    const result = htmlToMarkdown(html, td);
    expect(result).toBe("<!-- image: abc123 -->");
  });

  it("handles mixed content", () => {
    const html = [
      '<hr data-timestamp="2026-03-04T07:06:25.486Z" data-label="8:06 AM" contenteditable="false">',
      "<div>Some text here.</div>",
      '<div data-section-type="dream">+dream</div>',
      "<div>Dream content.</div>",
    ].join("");
    const result = htmlToMarkdown(html, td);
    expect(result).toContain("---");
    expect(result).toContain("<!-- time: 8:06 AM -->");
    expect(result).toContain("Some text here.");
    expect(result).toContain("## +dream");
    expect(result).toContain("Dream content.");
  });

  it("converts headings", () => {
    expect(htmlToMarkdown("<h1>Title</h1>", td)).toBe("# Title");
    expect(htmlToMarkdown("<h2>Sub</h2>", td)).toBe("## Sub");
  });

  it("converts blockquote", () => {
    expect(htmlToMarkdown("<blockquote>quote</blockquote>", td)).toBe(
      "> quote",
    );
  });

  it("converts code", () => {
    expect(htmlToMarkdown("<code>const x = 1</code>", td)).toBe(
      "`const x = 1`",
    );
  });
});

describe("exportNotesAsZip", () => {
  function mockRepo(
    dates: string[],
    notes: Record<string, string>,
  ): NoteRepository {
    return {
      getAllDates: vi.fn().mockResolvedValue(ok(dates)),
      getAllDatesForYear: vi.fn().mockResolvedValue(ok([])),
      get: vi.fn().mockImplementation((date: string) => {
        const content = notes[date];
        if (!content) return Promise.resolve(ok(null));
        return Promise.resolve(
          ok({
            date,
            content,
            updatedAt: new Date().toISOString(),
          }),
        );
      }),
      save: vi.fn().mockResolvedValue(ok(undefined)),
      delete: vi.fn().mockResolvedValue(ok(undefined)),
    };
  }

  it("returns null for empty notes", async () => {
    const repo = mockRepo([], {});
    const result = await exportNotesAsZip(repo);
    expect(result).toBeNull();
  });

  it("returns a zip blob for notes", async () => {
    const repo = mockRepo(["16-03-2026"], {
      "16-03-2026": "<p>Hello world</p>",
    });
    const result = await exportNotesAsZip(repo);
    expect(result).toBeInstanceOf(Blob);
    expect(result!.type).toBe("application/zip");
    expect(result!.size).toBeGreaterThan(0);
  });

  it("throws on repository error", async () => {
    const repo: NoteRepository = {
      getAllDates: vi
        .fn()
        .mockResolvedValue(err({ type: "IO", message: "fail" })),
      getAllDatesForYear: vi.fn().mockResolvedValue(ok([])),
      get: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    await expect(exportNotesAsZip(repo)).rejects.toThrow(
      "Failed to fetch note dates",
    );
  });

  it("skips notes with empty content", async () => {
    const repo = mockRepo(["16-03-2026", "17-03-2026"], {
      "16-03-2026": "<p></p>",
      "17-03-2026": "<p>Real content</p>",
    });
    const result = await exportNotesAsZip(repo);
    expect(result).toBeInstanceOf(Blob);
  });
});
