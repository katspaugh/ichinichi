import { test, expect } from './fixtures';

test.describe('Section transform (+typename)', () => {
  test.beforeEach(async ({ helpers }) => {
    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault('testpassword123');
  });

  test('typing +trumpet and pressing Enter creates a section header', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('+trumpet');
    await expect(editor).toContainText('+trumpet');
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');

    const header = editor.locator('[data-section-type="trumpet"]');
    await expect(header).toBeVisible({ timeout: 3000 });
    await expect(header).toHaveText('+trumpet');
  });
});
