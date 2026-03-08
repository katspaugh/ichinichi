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

  test("inserts HR before cursor block on mobile (no auto-focus priming)", async ({
    mount,
    page,
  }) => {
    // Simulate the mobile path: existing content, 10+ minutes since last edit.
    // On mobile, auto-focus is skipped when content exists, so
    // lastEditedBlockRef stays null. The HR should still be inserted
    // near the cursor — not at the very beginning of the note.
    const oldTimestamp = "2026-01-16T08:00:00.000Z";
    const startTime = new Date("2026-01-16T10:15:00.000Z"); // >10min later
    await page.clock.install({ time: startTime });

    // Emulate mobile viewport so auto-focus is skipped
    await page.setViewportSize({ width: 375, height: 667 });

    const editor = await mount(
      <EditorHarness
        content={`<hr data-timestamp="${oldTimestamp}"><p>Morning notes</p><p>More notes</p>`}
      />,
    );

    // Tap at the end of the last paragraph (simulating mobile tap)
    await editor.locator("p").last().click();
    await page.keyboard.press("End");

    // Type to trigger first input — this is where the bug fires
    await page.keyboard.press("Enter");

    // The new timestamp HR should NOT be the first child
    const firstChild = await editor.evaluate(
      (el) => el.firstElementChild?.tagName,
    );
    const firstChildTimestamp = await editor.evaluate(
      (el) => el.firstElementChild?.getAttribute("data-timestamp"),
    );

    // The original HR should still be first
    expect(firstChild).toBe("HR");
    expect(firstChildTimestamp).toBe(oldTimestamp);

    // A new HR should exist after the original one
    const allTimestamps = await editor
      .locator("hr[data-timestamp]")
      .evaluateAll((hrs) =>
        hrs.map((hr) => hr.getAttribute("data-timestamp")),
      );
    expect(allTimestamps).toHaveLength(2);
    // The new timestamp should be later than the old one
    expect(Date.parse(allTimestamps[1]!)).toBeGreaterThan(
      Date.parse(oldTimestamp),
    );
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
