import { test, expect } from "@playwright/experimental-ct-react";
import { EditorHarness } from "./EditorHarness";

test.describe("Timestamp HR insertion", () => {
  test("inserts timestamped HR on first newline after 10 minutes", async ({
    mount,
    page,
  }) => {
    const startTime = new Date("2026-01-16T10:00:00.000Z");
    await page.clock.install({ time: startTime });

    const editor = await mount(
      <EditorHarness content="<p>First</p><p>Second</p>" />,
    );

    // Edit in first paragraph — triggers initial timestamp insertion
    await editor.locator("p").first().click();
    await page.keyboard.type("x");
    await page.keyboard.press("Backspace");

    // Edit in second paragraph
    await editor.locator("p").nth(1).click();
    await page.keyboard.type("x");
    await page.keyboard.press("Backspace");

    const hrsBeforeAdvance = await editor
      .locator("hr[data-timestamp]")
      .count();

    // Advance time by 11 minutes
    const laterTime = new Date(startTime.getTime() + 11 * 60 * 1000);
    await page.clock.setFixedTime(laterTime);

    // Press Enter to create a new block — triggers new timestamp
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    // Should have one more HR than before
    const hrsAfterAdvance = await editor
      .locator("hr[data-timestamp]")
      .count();
    expect(hrsAfterAdvance).toBe(hrsBeforeAdvance + 1);

    // The latest HR should have the later timestamp
    const allTimestamps = await editor
      .locator("hr[data-timestamp]")
      .evaluateAll((hrs) =>
        hrs.map((hr) => hr.getAttribute("data-timestamp")),
      );
    expect(allTimestamps).toContain(laterTime.toISOString());
  });

  test("does not mark editor empty when only HR remains", async ({
    mount,
  }) => {
    const editor = await mount(
      <EditorHarness content='<hr data-timestamp="2026-01-16T10:00:00.000Z">' />,
    );

    await expect(editor.locator("hr")).toHaveCount(1);
    await expect(editor).not.toHaveAttribute("data-empty");
  });
});
