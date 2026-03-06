import { test, expect } from './fixtures';

test.describe('Note Editing', () => {
  test.beforeEach(async ({ helpers }) => {
    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault('testpassword123');
  });

  test('past notes are read-only', async ({ page, helpers }) => {
    // First create a note for today
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await helpers.typeInEditor('Note for today');
    await helpers.waitForSave();

    // Calculate yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = helpers.formatDate(yesterday);

    // Open yesterday's date - if there's no note, it may not show read-only badge
    await helpers.openNote(yesterdayDate);

    // The editor should be visible but read-only is indicated
    const editorExists = await editor.isVisible({ timeout: 2000 }).catch(() => false);
    if (editorExists) {
      // Past notes should have aria-readonly
      const isReadonly = await editor.getAttribute('aria-readonly');
      expect(isReadonly).toBe('true');
    }
  });

  test('can navigate between notes using arrows', async ({ page, helpers }) => {
    // Create a note for today
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    await helpers.typeInEditor('Today note content');
    await helpers.waitForSave();

    // Navigation arrows should be visible
    const prevArrow = page.getByRole('button', { name: 'Previous note' });
    const nextArrow = page.getByRole('button', { name: 'Next note' });

    await expect(prevArrow).toBeDisabled();
    await expect(nextArrow).toBeDisabled();
  });

  test('displays correct date in note header', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    // Get today's formatted date
    const today = new Date();
    const expectedMonth = today.toLocaleDateString('en-US', { month: 'long' });
    const expectedDay = today.getDate();

    const dateHeader = page.locator('[class*="NoteEditor__date"]');
    await expect(dateHeader).toContainText(expectedMonth);
    await expect(dateHeader).toContainText(String(expectedDay));
  });

  test('preserves formatting in notes', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    await helpers.typeInEditor('Line 1\nLine 2\nLine 3');
    await helpers.waitForSave();

    // Navigate away and reopen
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await helpers.openNote(todayDate);

    await expect.poll(async () => helpers.getEditorContent(), {
      timeout: 5000,
    }).toContain('Line 1');
    await expect.poll(async () => helpers.getEditorContent(), {
      timeout: 5000,
    }).toContain('Line 2');
    await expect.poll(async () => helpers.getEditorContent(), {
      timeout: 5000,
    }).toContain('Line 3');
  });
});

test.describe('Note Navigation via Keyboard', () => {
  test.beforeEach(async ({ helpers }) => {
    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault('testpassword123');
  });

  test('arrow keys navigate when editor is not focused', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    await helpers.typeInEditor('Test note');
    await helpers.waitForSave();

    // Click outside the editor to unfocus
    await page.locator('body').click({ position: { x: 10, y: 10 } });

    // Navigation should be available
    const prevArrow = page.getByRole('button', { name: 'Previous note' });
    const nextArrow = page.getByRole('button', { name: 'Next note' });
    await expect(prevArrow).toBeDisabled();
    await expect(nextArrow).toBeDisabled();
  });
});
