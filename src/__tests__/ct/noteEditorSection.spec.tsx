import { test, expect } from "@playwright/experimental-ct-react";
import { EditorHarness } from "./EditorHarness";

test.describe("Section transform", () => {
  test("transforms +typename on Enter into section header", async ({
    mount,
    page,
  }) => {
    const editor = await mount(
      <EditorHarness content="<div>+dream</div>" />,
    );

    await editor.locator("div").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    const header = editor.locator("[data-section-type]");
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute("data-section-type", "dream");
    await expect(header).toHaveText("+dream");
  });

  test("does not transform non-matching text", async ({ mount, page }) => {
    const editor = await mount(
      <EditorHarness content="<div>hello world</div>" />,
    );

    await editor.locator("div").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    await expect(editor.locator("[data-section-type]")).toHaveCount(0);
  });

  test("creates body div after section header", async ({ mount, page }) => {
    const editor = await mount(
      <EditorHarness content="<div>+dream</div>" />,
    );

    await editor.locator("div").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    const header = editor.locator("[data-section-type]");
    await expect(header).toBeVisible();

    const hasBodyDiv = await editor.evaluate((el) => {
      const h = el.querySelector("[data-section-type]");
      const next = h?.nextElementSibling;
      return next?.tagName === "DIV";
    });
    expect(hasBodyDiv).toBe(true);
  });

  test("transforms after existing content with HRs", async ({
    mount,
    page,
  }) => {
    const content = [
      '<hr data-timestamp="2026-03-04T07:06:25.486Z" data-label="8:06 AM" contenteditable="false">',
      "Some earlier text.",
      "<div>More content here.</div>",
      '<hr data-timestamp="2026-03-04T08:15:11.652Z" data-label="9:15 AM" contenteditable="false">',
      "<div>Even more content.</div>",
      "<div>+trumpet</div>",
    ].join("");

    const editor = await mount(<EditorHarness content={content} />);

    await editor.getByText("+trumpet").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    const header = editor.locator("[data-section-type]");
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute("data-section-type", "trumpet");
    await expect(header).toHaveText("+trumpet");
  });

  test("transforms bare text not wrapped in div", async ({ mount, page }) => {
    const editor = await mount(<EditorHarness content="" />);

    await editor.click();
    await page.keyboard.type("+trumpet");
    await page.keyboard.press("Enter");

    const header = editor.locator("[data-section-type]");
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute("data-section-type", "trumpet");
  });

  test("transforms after timestamp insertion", async ({ mount, page }) => {
    const oldTimestamp = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const content = [
      `<hr data-timestamp="${oldTimestamp}" data-label="earlier" contenteditable="false">`,
      "<div>Some existing content.</div>",
    ].join("");

    const editor = await mount(<EditorHarness content={content} />);

    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("+trumpet");
    await page.keyboard.press("Enter");

    const header = editor.locator("[data-section-type]");
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute("data-section-type", "trumpet");
    await expect(header).toHaveText("+trumpet");
  });

  test("transforms +typename in div that also contains HR", async ({
    mount,
    page,
  }) => {
    const content = [
      "<div>Earlier content.</div>",
      '<div><hr data-timestamp="2026-03-04T21:16:08.647Z" data-label="10:16 PM" contenteditable="false">+trumpet</div>',
    ].join("");

    const editor = await mount(<EditorHarness content={content} />);

    await editor.getByText("+trumpet").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    const header = editor.locator("[data-section-type]");
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute("data-section-type", "trumpet");
    await expect(header).toHaveText("+trumpet");
  });
});
