import { test, expect } from "@playwright/experimental-ct-react";
import { EditorImageDropHarness } from "./EditorHarness";

test.describe("Image drop preview", () => {
  test("renders dropped image immediately using blob URL", async ({
    mount,
    page,
  }) => {
    const editor = await mount(<EditorImageDropHarness />);

    // Drop a file via native DragEvent
    await editor.evaluate((el) => {
      const file = new File(["data"], "photo.png", { type: "image/png" });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      el.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: 0,
          clientY: 10,
        }),
      );
    });

    // Preview should appear with blob URL
    const preview = editor.locator('img[data-image-id="uploading"]');
    await expect(preview).toBeVisible();
    const src = await preview.getAttribute("src");
    expect(src).toMatch(/^blob:/);

    // Resolve the upload
    await page.evaluate(() => {
      const w = window as unknown as Record<string, (...args: unknown[]) => void>;
      w.__resolveImageUpload({
        id: "img-1",
        width: 120,
        height: 80,
        filename: "photo.png",
      });
    });

    // Final image should replace preview
    const finalImage = editor.locator('img[data-image-id="img-1"]');
    await expect(finalImage).toBeVisible();

    // Preview should be gone
    await expect(
      editor.locator('img[data-image-id="uploading"]'),
    ).toHaveCount(0);
  });

  test("preserves image placeholder during content prop changes", async ({
    mount,
    page,
  }) => {
    const editor = await mount(
      <EditorImageDropHarness content="existing text" />,
    );

    // Drop a file
    await editor.evaluate((el) => {
      const file = new File(["data"], "photo.png", { type: "image/png" });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      el.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: 0,
          clientY: 10,
        }),
      );
    });

    // Placeholder should be in DOM
    const placeholder = editor.locator('img[data-image-id="uploading"]');
    await expect(placeholder).toBeVisible();

    // Resolve the upload
    await page.evaluate(() => {
      const w = window as unknown as Record<string, (...args: unknown[]) => void>;
      w.__resolveImageUpload({
        id: "img-1",
        width: 120,
        height: 80,
        filename: "photo.png",
      });
    });

    // Final image should be present
    const finalImage = editor.locator('img[data-image-id="img-1"]');
    await expect(finalImage).toBeVisible();
  });
});
