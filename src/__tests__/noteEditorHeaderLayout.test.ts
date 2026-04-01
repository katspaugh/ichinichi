import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("NoteEditor header layout", () => {
  it("keeps header width aligned with editor body width", () => {
    const cssPath = resolve(
      process.cwd(),
      "src/components/NoteEditor/NoteEditor.module.css",
    );
    const css = readFileSync(cssPath, "utf8");
    const headerRuleMatch = css.match(/\.header\s*\{[^}]*\}/m);

    expect(headerRuleMatch).toBeTruthy();
    expect(headerRuleMatch?.[0]).toMatch(/\bmax-width\s*:\s*65ch\b/);
  });

  it("anchors saving status inside header bounds", () => {
    const cssPath = resolve(
      process.cwd(),
      "src/components/NoteEditor/NoteEditor.module.css",
    );
    const css = readFileSync(cssPath, "utf8");
    const headerRuleMatch = css.match(/\.header\s*\{[^}]*\}/m);

    expect(headerRuleMatch).toBeTruthy();
    expect(headerRuleMatch?.[0]).toMatch(/\bposition\s*:\s*(relative|sticky)\b/);
  });
});
