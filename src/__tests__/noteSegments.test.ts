// @vitest-environment jsdom
import { parseNoteSegments, assembleSegments } from "../utils/noteSegments";

describe("parseNoteSegments", () => {
  it("returns empty array for empty string", () => {
    expect(parseNoteSegments("")).toEqual([]);
  });

  it("returns single segment for content without timestamp HRs", () => {
    const html = "<p>Hello world</p>";
    const segments = parseNoteSegments(html);
    expect(segments).toHaveLength(1);
    expect(segments[0].id).toBe("preamble");
    expect(segments[0].timestamp).toBeNull();
    expect(segments[0].label).toBeNull();
    expect(segments[0].html).toBe("<p>Hello world</p>");
  });

  it("splits on timestamp HRs", () => {
    const html =
      '<hr data-timestamp="2026-04-10T08:00:00.000Z" data-label="8:00 AM" contenteditable="false">' +
      "<p>Morning entry</p>" +
      '<hr data-timestamp="2026-04-10T14:30:00.000Z" data-label="2:30 PM" contenteditable="false">' +
      "<p>Afternoon entry</p>";
    const segments = parseNoteSegments(html);
    expect(segments).toHaveLength(2);
    expect(segments[0].timestamp).toBe("2026-04-10T08:00:00.000Z");
    expect(segments[0].label).toBe("8:00 AM");
    expect(segments[0].html).toBe("<p>Morning entry</p>");
    expect(segments[1].timestamp).toBe("2026-04-10T14:30:00.000Z");
    expect(segments[1].label).toBe("2:30 PM");
    expect(segments[1].html).toBe("<p>Afternoon entry</p>");
  });

  it("handles preamble content before first HR", () => {
    const html =
      "<p>Legacy content</p>" +
      '<hr data-timestamp="2026-04-10T10:00:00.000Z" data-label="10:00 AM" contenteditable="false">' +
      "<p>New entry</p>";
    const segments = parseNoteSegments(html);
    expect(segments).toHaveLength(2);
    expect(segments[0].id).toBe("preamble");
    expect(segments[0].timestamp).toBeNull();
    expect(segments[0].html).toBe("<p>Legacy content</p>");
    expect(segments[1].timestamp).toBe("2026-04-10T10:00:00.000Z");
  });

  it("ignores plain HRs without data-timestamp", () => {
    const html = "<p>Before</p><hr><p>After</p>";
    const segments = parseNoteSegments(html);
    expect(segments).toHaveLength(1);
    expect(segments[0].html).toBe("<p>Before</p><hr><p>After</p>");
  });

  it("handles multiple paragraphs per segment", () => {
    const html =
      '<hr data-timestamp="2026-04-10T08:00:00.000Z" data-label="8:00 AM" contenteditable="false">' +
      "<p>Line 1</p><p>Line 2</p>";
    const segments = parseNoteSegments(html);
    expect(segments).toHaveLength(1);
    expect(segments[0].html).toBe("<p>Line 1</p><p>Line 2</p>");
  });

  it("skips empty preamble", () => {
    const html =
      '<hr data-timestamp="2026-04-10T08:00:00.000Z" data-label="8:00 AM" contenteditable="false">' +
      "<p>Entry</p>";
    const segments = parseNoteSegments(html);
    expect(segments).toHaveLength(1);
    expect(segments[0].timestamp).toBe("2026-04-10T08:00:00.000Z");
  });
});

describe("assembleSegments", () => {
  it("returns empty string for empty array", () => {
    expect(assembleSegments([])).toBe("");
  });

  it("returns just html for preamble-only segment", () => {
    const segments = [
      { id: "preamble", timestamp: null, label: null, html: "<p>Hello</p>" },
    ];
    expect(assembleSegments(segments)).toBe("<p>Hello</p>");
  });

  it("reconstructs HR + content for timestamped segments", () => {
    const segments = [
      {
        id: "2026-04-10T08:00:00.000Z",
        timestamp: "2026-04-10T08:00:00.000Z",
        label: "8:00 AM",
        html: "<p>Morning</p>",
      },
    ];
    const result = assembleSegments(segments);
    expect(result).toBe(
      '<hr data-timestamp="2026-04-10T08:00:00.000Z" data-label="8:00 AM" contenteditable="false"><p>Morning</p>',
    );
  });

  it("roundtrips correctly", () => {
    const original =
      "<p>Legacy</p>" +
      '<hr data-timestamp="2026-04-10T08:00:00.000Z" data-label="8:00 AM" contenteditable="false">' +
      "<p>Morning</p>" +
      '<hr data-timestamp="2026-04-10T14:30:00.000Z" data-label="2:30 PM" contenteditable="false">' +
      "<p>Afternoon</p>";
    const segments = parseNoteSegments(original);
    const reassembled = assembleSegments(segments);
    expect(reassembled).toBe(original);
  });
});
