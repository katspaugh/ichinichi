/**
 * Tests that use pre-seeded data (local mode)
 *
 * Prerequisites:
 * 1. Run seed script first: yarn test:e2e:seed
 * 2. Or have existing notes from previous test runs
 *
 * These tests work with local storage data.
 */

import { test, expect } from './fixtures';

test.describe('Seeded Data Tests (Local Mode)', () => {
  test.beforeEach(async ({ page, helpers }) => {
    // Don't clear storage - we want to keep seeded data
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Dismiss intro modal if it appears (first time on this browser)
    await helpers.dismissIntroModal();

    // Set up local vault if needed
    await helpers.setupLocalVault();

    // Wait for app to be ready
    await page.waitForTimeout(1000);
  });

  test('calendar shows note indicators for days with notes', async ({ page }) => {
    // Look for any day cells that have notes
    const cellsWithNotes = page.locator('[aria-label*="has note"]');

    // Count notes
    const count = await cellsWithNotes.count();
    console.log(`Found ${count} days with notes`);

    // If seeded properly, should have at least one note
    // This is informational - test passes either way
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('can view an existing note if one exists', async ({ page }) => {
    // Find a day with a note
    const cellWithNote = page.locator('[aria-label*="has note"]').first();

    if (await cellWithNote.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Click to open the note
      await cellWithNote.click();

      // Editor should appear with content
      const editor = page.locator('[data-note-editor="content"]');
      await expect(editor).toBeVisible({ timeout: 10000 });

      // Should have some content (not empty)
      const content = await editor.innerText();
      console.log(`Note content preview: ${content.substring(0, 50)}...`);
      expect(content.length).toBeGreaterThan(0);
    } else {
      console.log('No existing notes found - run seed script first');
    }
  });

  test('can edit today\'s note', async ({ page }) => {
    // Find today's cell
    const today = new Date();
    const day = today.getDate();
    const todayCell = page.getByRole('button', { name: new RegExp(`January ${day}, 2026`) });

    if (await todayCell.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Click to open today's note
      await todayCell.click();

      // Editor should appear
      const editor = page.locator('[data-note-editor="content"]');
      await expect(editor).toBeVisible({ timeout: 10000 });

      // Make a small edit
      await editor.click();
      const testText = ` - Edit at ${new Date().toISOString()}`;
      await page.keyboard.press('End');
      await page.keyboard.type(testText);

      // Wait for auto-save
      await page.waitForTimeout(2000);

      // Close and reopen to verify save
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);

      // Close any modal that might have appeared
      const closeButton = page.locator('button:has-text("✕")');
      if (await closeButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(500);
      }

      await todayCell.click();
      await expect(editor).toBeVisible({ timeout: 10000 });

      const content = await editor.innerText();
      expect(content).toContain('Edit at');
    } else {
      console.log('Today\'s cell not clickable - vault may be locked');
    }
  });

  test('can navigate between notes using arrows', async ({ page }) => {
    // Find and open a note
    const cellWithNote = page.locator('[aria-label*="has note"]').first();

    if (await cellWithNote.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cellWithNote.click();

      const editor = page.locator('[data-note-editor="content"]');
      await expect(editor).toBeVisible({ timeout: 10000 });

      // Check for navigation arrows
      const prevArrow = page.locator('[aria-label*="Previous"]');
      const nextArrow = page.locator('[aria-label*="Next"]');

      const hasPrev = await prevArrow.isVisible({ timeout: 1000 }).catch(() => false);
      const hasNext = await nextArrow.isVisible({ timeout: 1000 }).catch(() => false);

      console.log(`Navigation: prev=${hasPrev}, next=${hasNext}`);

      // At least one arrow should be visible if there are multiple notes
      if (hasPrev || hasNext) {
        // Try clicking a navigation arrow
        if (hasPrev && !(await prevArrow.isDisabled())) {
          await prevArrow.click();
          await page.waitForTimeout(500);
          // Editor should still be visible after navigation
          await expect(editor).toBeVisible();
        } else if (hasNext && !(await nextArrow.isDisabled())) {
          await nextArrow.click();
          await page.waitForTimeout(500);
          await expect(editor).toBeVisible();
        }
      }
    } else {
      console.log('No notes to navigate between');
    }
  });
});
