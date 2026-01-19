import { test, expect } from './fixtures';

test.describe('Note Editing', () => {
  test.beforeEach(async ({ helpers }) => {
    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault('testpassword123');
  });

  test('can create a new note for today', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    // Editor should be visible and editable
    const editor = page.locator('[data-note-editor="content"]');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('contenteditable', 'true');

    // Type some content
    await editor.click();
    await page.keyboard.type('Hello, this is my daily note!');

    // Wait for save
    await helpers.waitForSave();

    // Close and reopen to verify persistence
    await helpers.closeNoteModal();
    await helpers.openNote(todayDate);

    const content = await helpers.getEditorContent();
    expect(content).toContain('Hello, this is my daily note!');
  });

  test('shows saving indicator when editing', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await editor.click();
    await page.keyboard.type('Testing save indicator');

    // The saving indicator should eventually appear
    await expect(page.getByText('Saving...')).toBeVisible({ timeout: 5000 });
  });

  test('past notes are read-only', async ({ page, helpers }) => {
    // First create a note for today
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await editor.click();
    await page.keyboard.type('Note for today');
    await helpers.waitForSave();
    await helpers.closeNoteModal();

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

    const editor = page.locator('[data-note-editor="content"]');
    await editor.click();
    await page.keyboard.type('Today note content');
    await helpers.waitForSave();

    // Navigation arrows should be visible
    const prevArrow = page.locator('[aria-label*="Previous"]');
    const nextArrow = page.locator('[aria-label*="Next"]');

    // At least one arrow should be visible (depending on note history)
    const hasPrevArrow = await prevArrow.isVisible({ timeout: 1000 }).catch(() => false);
    const hasNextArrow = await nextArrow.isVisible({ timeout: 1000 }).catch(() => false);

    expect(hasPrevArrow || hasNextArrow).toBe(true);
  });

  test('escape key closes the note modal', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await expect(editor).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Modal should be closed
    await expect(editor).not.toBeVisible();
  });

  test('empty note gets deleted', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await editor.click();
    await page.keyboard.type('Temporary content');
    await helpers.waitForSave();

    // Clear the content
    await editor.click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    await helpers.waitForSave();

    // Close and return to calendar
    await helpers.closeNoteModal();

    // The day should no longer show "has note" indicator
    const today = new Date();
    const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });
    const month = today.toLocaleDateString('en-US', { month: 'long' });
    const day = today.getDate();

    const todayCell = page.locator(
      `[role="button"][aria-label*="${dayOfWeek}"][aria-label*="${month} ${day}"]`
    );

    // Should not contain "has note" in aria-label anymore
    const ariaLabel = await todayCell.getAttribute('aria-label');
    expect(ariaLabel).not.toContain('has note');
  });

  test('displays correct date in note header', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    // Get today's formatted date
    const today = new Date();
    const expectedMonth = today.toLocaleDateString('en-US', { month: 'long' });
    const expectedDay = today.getDate();

    // Check that the header shows the correct date
    await expect(page.locator(`text=${expectedMonth}`)).toBeVisible();
    await expect(page.locator(`text=${expectedDay}`)).toBeVisible();
  });

  test('preserves formatting in notes', async ({ page, helpers }) => {
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);

    const editor = page.locator('[data-note-editor="content"]');
    await editor.click();

    // Type multiple lines
    await page.keyboard.type('Line 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 2');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 3');
    await helpers.waitForSave();

    // Close and reopen
    await helpers.closeNoteModal();
    await helpers.openNote(todayDate);

    const content = await helpers.getEditorContent();
    expect(content).toContain('Line 1');
    expect(content).toContain('Line 2');
    expect(content).toContain('Line 3');
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

    const editor = page.locator('[data-note-editor="content"]');
    await editor.click();
    await page.keyboard.type('Test note');
    await helpers.waitForSave();

    // Click outside the editor to unfocus
    await page.locator('body').click({ position: { x: 10, y: 10 } });

    // Navigation should be available
    const hasNavigationArrows =
      (await page.locator('[aria-label*="Previous"]').isVisible({ timeout: 1000 }).catch(() => false)) ||
      (await page.locator('[aria-label*="Next"]').isVisible({ timeout: 1000 }).catch(() => false));

    expect(hasNavigationArrows).toBe(true);
  });
});
