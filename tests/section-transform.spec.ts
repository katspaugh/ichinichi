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

    await page.keyboard.type('Some initial content');
    await page.keyboard.press('Enter');
    await page.keyboard.type('+trumpet');
    await expect(editor).toContainText('+trumpet');
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');

    const header = editor.locator('[data-section-type="trumpet"]');
    await expect(header).toBeVisible({ timeout: 3000 });
    await expect(header).toHaveText('+trumpet');
  });

  test('typing +dream on first line creates a section header', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('+dream');
    await expect(editor).toContainText('+dream');
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');

    const header = editor.locator('[data-section-type="dream"]');
    await expect(header).toBeVisible({ timeout: 3000 });
    await expect(header).toHaveText('+dream');
  });

  test('Shift+Enter after +trumpet also creates a section header', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('Some content first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('+trumpet');
    await expect(editor).toContainText('+trumpet');
    await page.waitForTimeout(100);

    await page.keyboard.press('Shift+Enter');

    const header = editor.locator('[data-section-type="trumpet"]');
    await expect(header).toBeVisible({ timeout: 3000 });
    await expect(header).toHaveText('+trumpet');
  });
});
