import { isUrl, findUrls, normalizeUrl } from "../utils/linkify";

describe("isUrl", () => {
  it("recognizes https URL followed by space", () => {
    expect(isUrl("https://example.com ")).toBe(true);
  });

  it("recognizes http URL followed by space", () => {
    expect(isUrl("http://example.com ")).toBe(true);
  });

  it("recognizes www URL followed by space", () => {
    expect(isUrl("www.example.com ")).toBe(true);
  });

  it("rejects URL at end of string (no trailing space)", () => {
    // The pattern requires trailing whitespace to match
    expect(isUrl("https://example.com")).toBe(false);
  });

  it("rejects plain text", () => {
    expect(isUrl("not a url ")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isUrl("")).toBe(false);
  });

  it("recognizes URL with path followed by space", () => {
    expect(isUrl("https://example.com/path/to/page ")).toBe(true);
  });

  it("recognizes URL with query params followed by space", () => {
    expect(isUrl("https://example.com?foo=bar&baz=qux ")).toBe(true);
  });

  it("recognizes URL with fragment followed by space", () => {
    expect(isUrl("https://example.com#section ")).toBe(true);
  });
});

describe("findUrls", () => {
  it("finds a single URL in text", () => {
    const result = findUrls("Visit https://example.com for more info");
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://example.com");
    expect(result[0].start).toBe(6);
    expect(result[0].end).toBe(25);
  });

  it("finds multiple URLs in text", () => {
    const result = findUrls(
      "Check https://foo.com and https://bar.com for details",
    );
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe("https://foo.com");
    expect(result[1].url).toBe("https://bar.com");
  });

  it("finds www URLs", () => {
    const result = findUrls("Go to www.example.com now");
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("www.example.com");
  });

  it("returns empty array when no URLs found", () => {
    expect(findUrls("no urls here")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(findUrls("")).toEqual([]);
  });

  it("does not match URLs at the very end of string (no trailing space)", () => {
    const result = findUrls("Visit https://example.com");
    expect(result).toHaveLength(0);
  });

  it("captures URLs with complex paths", () => {
    const result = findUrls(
      "See https://example.com/path/to/page?q=test#hash for details",
    );
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe(
      "https://example.com/path/to/page?q=test#hash",
    );
  });

  it("reports correct start and end positions", () => {
    const text = "AB https://x.com CD";
    const result = findUrls(text);
    expect(result).toHaveLength(1);
    expect(text.substring(result[0].start, result[0].end)).toBe(
      "https://x.com",
    );
  });
});

describe("normalizeUrl", () => {
  it("prepends https:// to www URLs", () => {
    expect(normalizeUrl("www.example.com")).toBe("https://www.example.com");
  });

  it("leaves https URLs unchanged", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("leaves http URLs unchanged", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("handles www URL with path", () => {
    expect(normalizeUrl("www.example.com/path")).toBe(
      "https://www.example.com/path",
    );
  });
});
