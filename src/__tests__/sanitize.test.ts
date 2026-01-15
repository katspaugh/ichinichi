import { sanitizeHtml, isContentEmpty } from "../utils/sanitize";

describe("sanitizeHtml", () => {
  describe("input handling", () => {
    it("returns empty string for null/undefined input", () => {
      expect(sanitizeHtml(null as unknown as string)).toBe("");
      expect(sanitizeHtml(undefined as unknown as string)).toBe("");
    });

    it("returns empty string for non-string input", () => {
      expect(sanitizeHtml(123 as unknown as string)).toBe("");
      expect(sanitizeHtml({} as unknown as string)).toBe("");
    });

    it("returns empty string for empty string input", () => {
      expect(sanitizeHtml("")).toBe("");
    });

    it("passes through plain text unchanged", () => {
      expect(sanitizeHtml("Hello, world!")).toBe("Hello, world!");
    });
  });

  describe("allowed tags", () => {
    it("allows basic formatting tags", () => {
      expect(sanitizeHtml("<b>bold</b>")).toBe("<b>bold</b>");
      expect(sanitizeHtml("<i>italic</i>")).toBe("<i>italic</i>");
      expect(sanitizeHtml("<em>emphasis</em>")).toBe("<em>emphasis</em>");
      expect(sanitizeHtml("<strong>strong</strong>")).toBe(
        "<strong>strong</strong>",
      );
      expect(sanitizeHtml("<u>underline</u>")).toBe("<u>underline</u>");
      expect(sanitizeHtml("<s>strikethrough</s>")).toBe("<s>strikethrough</s>");
      expect(sanitizeHtml("<del>deleted</del>")).toBe("<del>deleted</del>");
    });

    it("allows structural tags", () => {
      expect(sanitizeHtml("<br>")).toBe("<br>");
      expect(sanitizeHtml("<p>paragraph</p>")).toBe("<p>paragraph</p>");
      expect(sanitizeHtml("<div>div</div>")).toBe("<div>div</div>");
      expect(sanitizeHtml("<span>span</span>")).toBe("<span>span</span>");
      expect(sanitizeHtml("<hr>")).toBe("<hr>");
    });

    it("allows heading tags", () => {
      expect(sanitizeHtml("<h1>H1</h1>")).toBe("<h1>H1</h1>");
      expect(sanitizeHtml("<h2>H2</h2>")).toBe("<h2>H2</h2>");
      expect(sanitizeHtml("<h3>H3</h3>")).toBe("<h3>H3</h3>");
    });

    it("allows code tags", () => {
      expect(sanitizeHtml("<code>const x = 1;</code>")).toBe(
        "<code>const x = 1;</code>",
      );
    });

    it("allows img tags", () => {
      expect(sanitizeHtml("<img>")).toBe("<img>");
    });

    it("allows anchor tags", () => {
      expect(sanitizeHtml("<a>link</a>")).toBe("<a>link</a>");
    });
  });

  describe("allowed attributes", () => {
    it("allows data-image-id on img", () => {
      expect(sanitizeHtml('<img data-image-id="abc123">')).toBe(
        '<img data-image-id="abc123">',
      );
    });

    it("allows data-timestamp attribute", () => {
      expect(sanitizeHtml('<span data-timestamp="123">time</span>')).toBe(
        '<span data-timestamp="123">time</span>',
      );
    });

    it("allows data-label attribute", () => {
      expect(sanitizeHtml('<span data-label="test">label</span>')).toBe(
        '<span data-label="test">label</span>',
      );
    });

    it("allows alt, width, height on img", () => {
      expect(
        sanitizeHtml('<img alt="test" width="100" height="100">'),
      ).toBe('<img alt="test" width="100" height="100">');
    });

    it("allows href, target, rel on anchor", () => {
      expect(
        sanitizeHtml(
          '<a href="https://example.com" target="_blank" rel="noopener">link</a>',
        ),
      ).toBe(
        '<a href="https://example.com" target="_blank" rel="noopener">link</a>',
      );
    });

    it("allows contenteditable attribute", () => {
      expect(sanitizeHtml('<div contenteditable="false">text</div>')).toBe(
        '<div contenteditable="false">text</div>',
      );
    });
  });

  describe("XSS prevention", () => {
    it("strips script tags", () => {
      expect(sanitizeHtml("<script>alert('xss')</script>")).toBe("");
    });

    it("strips onerror handlers", () => {
      expect(sanitizeHtml('<img onerror="alert(1)">')).toBe("<img>");
    });

    it("strips onclick handlers", () => {
      expect(sanitizeHtml('<div onclick="alert(1)">click</div>')).toBe(
        "<div>click</div>",
      );
    });

    it("strips onload handlers", () => {
      expect(sanitizeHtml('<img onload="alert(1)">')).toBe("<img>");
    });

    it("strips javascript: URLs", () => {
      expect(sanitizeHtml('<a href="javascript:alert(1)">link</a>')).toBe(
        "<a>link</a>",
      );
    });

    it("strips src attribute (set dynamically)", () => {
      expect(sanitizeHtml('<img src="https://evil.com/img.jpg">')).toBe(
        "<img>",
      );
    });

    it("strips style attributes", () => {
      expect(sanitizeHtml('<div style="color:red">text</div>')).toBe(
        "<div>text</div>",
      );
    });

    it("strips iframe tags", () => {
      expect(sanitizeHtml('<iframe src="https://evil.com"></iframe>')).toBe("");
    });

    it("strips form tags", () => {
      expect(sanitizeHtml("<form><input></form>")).toBe("");
    });

    it("keeps content when stripping disallowed tags", () => {
      expect(sanitizeHtml("<script>alert(1)</script>Hello")).toBe("Hello");
      expect(sanitizeHtml("<custom>text</custom>")).toBe("text");
    });
  });

  describe("nested content", () => {
    it("handles nested allowed tags", () => {
      expect(sanitizeHtml("<p><b><i>nested</i></b></p>")).toBe(
        "<p><b><i>nested</i></b></p>",
      );
    });

    it("strips nested dangerous content", () => {
      expect(sanitizeHtml("<p><script>evil</script>safe</p>")).toBe(
        "<p>safe</p>",
      );
    });
  });
});

describe("isContentEmpty", () => {
  it("returns true for empty string", () => {
    expect(isContentEmpty("")).toBe(true);
  });

  it("returns true for null/undefined", () => {
    expect(isContentEmpty(null as unknown as string)).toBe(true);
    expect(isContentEmpty(undefined as unknown as string)).toBe(true);
  });

  it("returns true for whitespace-only content", () => {
    expect(isContentEmpty("   ")).toBe(true);
    expect(isContentEmpty("\n\t")).toBe(true);
  });

  it("returns true for empty tags", () => {
    expect(isContentEmpty("<p></p>")).toBe(true);
    expect(isContentEmpty("<div><span></span></div>")).toBe(true);
    expect(isContentEmpty("<br>")).toBe(true);
  });

  it("returns true for tags with only whitespace", () => {
    expect(isContentEmpty("<p>   </p>")).toBe(true);
    expect(isContentEmpty("<div>\n\t</div>")).toBe(true);
  });

  it("returns false for text content", () => {
    expect(isContentEmpty("Hello")).toBe(false);
    expect(isContentEmpty("<p>Hello</p>")).toBe(false);
  });

  it("returns false for content with images", () => {
    expect(isContentEmpty("<img>")).toBe(false);
    expect(isContentEmpty('<img src="test.jpg">')).toBe(false);
    expect(isContentEmpty('<p><img data-image-id="123"></p>')).toBe(false);
  });

  it("returns false for mixed content with text", () => {
    expect(isContentEmpty("<p>text</p><img>")).toBe(false);
  });

  it("returns true for empty content with only non-img elements", () => {
    expect(isContentEmpty("<p><br></p>")).toBe(true);
  });
});
