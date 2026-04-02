import { describe, it, expect } from "vitest";
import { getFaviconKey, getFaviconDataUri } from "../utils/linkFavicons";

describe("getFaviconKey", () => {
  it("matches YouTube URLs", () => {
    expect(getFaviconKey("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(getFaviconKey("https://youtu.be/abc")).toBe("youtube");
  });

  it("matches Twitter and X URLs", () => {
    expect(getFaviconKey("https://twitter.com/user")).toBe("twitter");
    expect(getFaviconKey("https://x.com/user")).toBe("x");
  });

  it("matches GitHub URLs", () => {
    expect(getFaviconKey("https://github.com/user/repo")).toBe("github");
  });

  it("matches Reddit URLs", () => {
    expect(getFaviconKey("https://www.reddit.com/r/test")).toBe("reddit");
  });

  it("matches Google URLs", () => {
    expect(getFaviconKey("https://docs.google.com/document/d/abc")).toBe(
      "google",
    );
    expect(getFaviconKey("https://drive.google.com/file/d/abc")).toBe("google");
  });

  it("matches Hacker News URLs", () => {
    expect(getFaviconKey("https://news.ycombinator.com/item?id=123")).toBe(
      "hackernews",
    );
  });

  it("matches Discord URLs", () => {
    expect(getFaviconKey("https://discord.com/invite/abc")).toBe("discord");
    expect(getFaviconKey("https://discord.gg/abc")).toBe("discord");
  });

  it("returns null for unknown domains", () => {
    expect(getFaviconKey("https://example.com")).toBeNull();
    expect(getFaviconKey("https://randomsite.org/page")).toBeNull();
  });

  it("handles www prefix", () => {
    expect(getFaviconKey("https://www.github.com/user")).toBe("github");
  });

  it("handles URLs without protocol (www.)", () => {
    expect(getFaviconKey("www.youtube.com/watch?v=abc")).toBe("youtube");
  });
});

describe("getFaviconDataUri", () => {
  it("returns a data URI for known keys", () => {
    const uri = getFaviconDataUri("youtube");
    expect(uri).toMatch(/^data:image\/svg\+xml,/);
  });

  it("returns null for unknown keys", () => {
    expect(getFaviconDataUri("unknown")).toBeNull();
  });
});
