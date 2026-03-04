import { extractSectionTypes, stringToHue } from "../utils/sectionTypes";
import { sanitizeHtml } from "../utils/sanitize";

describe("extractSectionTypes", () => {
  it("extracts section types from HTML", () => {
    const html = '<div data-section-type="dream">+dream</div><div>content</div>';
    expect(extractSectionTypes(html)).toEqual(["dream"]);
  });

  it("extracts multiple unique types", () => {
    const html =
      '<div data-section-type="dream">+dream</div><div>a</div>' +
      '<div data-section-type="gratitude">+gratitude</div><div>b</div>';
    expect(extractSectionTypes(html)).toEqual(["dream", "gratitude"]);
  });

  it("deduplicates repeated types", () => {
    const html =
      '<div data-section-type="dream">+dream</div><div>a</div>' +
      '<div data-section-type="dream">+dream</div><div>b</div>';
    expect(extractSectionTypes(html)).toEqual(["dream"]);
  });

  it("returns empty array for no sections", () => {
    expect(extractSectionTypes("<p>hello</p>")).toEqual([]);
    expect(extractSectionTypes("")).toEqual([]);
  });

  it("handles hyphenated type names", () => {
    const html = '<div data-section-type="book-notes">+book-notes</div>';
    expect(extractSectionTypes(html)).toEqual(["book-notes"]);
  });
});

describe("sanitizeHtml preserves section attributes", () => {
  it("preserves data-section-type on divs", () => {
    const html = '<div data-section-type="dream">+dream</div>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});

describe("Note sectionTypes integration", () => {
  it("extractSectionTypes returns types matching Note.sectionTypes contract", () => {
    const html =
      '<div data-section-type="dream">+dream</div><div>content</div>' +
      '<div data-section-type="gratitude">+gratitude</div><div>more</div>';
    const types = extractSectionTypes(html);
    expect(types).toEqual(["dream", "gratitude"]);
  });
});

describe("stringToHue", () => {
  it("returns a number between 0 and 360", () => {
    const hue = stringToHue("dream");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  it("is deterministic", () => {
    expect(stringToHue("dream")).toBe(stringToHue("dream"));
  });

  it("produces different hues for different strings", () => {
    expect(stringToHue("dream")).not.toBe(stringToHue("gratitude"));
  });
});
