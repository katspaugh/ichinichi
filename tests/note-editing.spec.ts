import { test, expect } from './fixtures';

test.describe('Note Editing', () => {
  test.beforeEach(async ({ helpers }) => {
    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault('testpassword123');
  });

  test('can create a note and persist it', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('contenteditable', 'true');

    await helpers.typeInEditor('Hello, this is my daily note!');
    await helpers.waitForSave();

    // Close and reopen to verify persistence
    await helpers.closeNoteModal();
    await helpers.openNote(todayDate);

    await expect.poll(async () => helpers.getEditorContent(), {
      timeout: 10000,
    }).toContain('Hello, this is my daily note!');
  });

  test('empty note gets deleted', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await helpers.typeInEditor('Temporary content');
    await helpers.waitForSave();

    // Clear the content
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await helpers.waitForSave();

    await helpers.closeNoteModal();

    // The day should no longer show "has note" indicator
    const today = new Date();
    const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });
    const month = today.toLocaleDateString('en-US', { month: 'long' });
    const day = today.getDate();

    const todayCell = page.locator(
      `[role="button"][aria-label*="${dayOfWeek}"][aria-label*="${month} ${day}"]`
    );
    const ariaLabel = await todayCell.getAttribute('aria-label');
    expect(ariaLabel).not.toContain('has note');
  });

  test('navigating to calendar hides the editor', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await expect(editor).toBeVisible();

    // Navigate back to year view
    const currentYear = new Date().getFullYear();
    await page.goto(`/?year=${currentYear}`);
    await expect(editor).not.toBeVisible();
  });
});
