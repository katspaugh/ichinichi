import { test, expect } from "@playwright/experimental-ct-react";
import { EditorHarness } from "./EditorHarness";

test.describe("Timestamp HR rendering", () => {
  // The automatic session-gap HR insertion (and the `---` → HR transform)
  // were removed in ccedada when today's note moved to the card-stack UI —
  // cards now stamp timestamps on save. The remaining behavior worth
  // guarding is that a note which only contains an HR isn't treated as
  // empty (otherwise the placeholder would show over real content).
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
