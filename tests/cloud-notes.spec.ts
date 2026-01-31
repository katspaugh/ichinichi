/**
 * Tests using pre-seeded cloud data in Supabase
 * These notes were seeded: Jan 1, 5, 10, 15 of last year
 */

import { test, expect } from './fixtures';

const TEST_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '';
const SEED_YEAR = new Date().getFullYear() - 1;
const SEED_MONTH_NAME = 'January';

test.describe('Cloud Notes', () => {
  test.beforeEach(async ({ page, helpers }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Test credentials not configured');

    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault(TEST_PASSWORD);

    // Sign in
    const signInButton = page.getByRole('button', { name: /Sign in/i });
    await signInButton.click();
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    // Switch to sign in mode if needed
    const signInToggle = page.getByRole('button', { name: /Already have an account/i });
    if (await signInToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
      await signInToggle.click();
    }

    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('#auth-password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();

    // Wait for vault unlock modal or auto-unlock
    await page.waitForTimeout(3000);

    // Handle vault unlock if needed
    const vaultInput = page.locator('#vault-password');
    if (await vaultInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await vaultInput.fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.waitForTimeout(2000);
    }

    // Should be synced
    await expect(page.getByText('Synced')).toBeVisible({ timeout: 10000 });
    await helpers.waitForVaultUnlocked();
  });

  test('shows note indicators for seeded dates', async ({ page, helpers }) => {
    // Navigate to seeded year
    await helpers.navigateToYear(SEED_YEAR);

    // Check for note indicators on seeded dates
    const cellsWithNotes = page.locator('[aria-label*="has note"]');
    const count = await cellsWithNotes.count();

    // Should have at least the 4 seeded notes
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('can open and view a seeded note', async ({ page, helpers }) => {
    await helpers.navigateToYear(SEED_YEAR);
    await helpers.clickDay(1, SEED_MONTH_NAME);

    // Editor should appear with content
    const editor = page.locator('[data-note-editor="content"]');
    await expect(editor).toBeVisible({ timeout: 10000 });

    // Should have content (not empty)
    const content = await editor.innerText();
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain(String(SEED_YEAR));
  });

  test('seeded notes are read-only (past dates)', async ({ page, helpers }) => {
    await helpers.navigateToYear(SEED_YEAR);
    await helpers.clickDay(1, SEED_MONTH_NAME);

    // Editor should appear
    const editor = page.locator('[data-note-editor="content"]');
    await expect(editor).toBeVisible({ timeout: 10000 });

    // Editor should be read-only (contenteditable=false)
    const isEditable = await editor.getAttribute('contenteditable');
    expect(isEditable).toBe('false');
  });

  test('can navigate between seeded notes', async ({ page, helpers }) => {
    await helpers.navigateToYear(SEED_YEAR);
    await helpers.clickDay(5, SEED_MONTH_NAME);

    const editor = page.locator('[data-note-editor="content"]');
    await expect(editor).toBeVisible({ timeout: 10000 });

    // Should have navigation arrows
    const prevArrow = page.getByRole('button', { name: 'Previous note' });
    const nextArrow = page.getByRole('button', { name: 'Next note' });

    // Jan 5 should have both prev (Jan 1) and next (Jan 10)
    await expect(prevArrow).toBeVisible();
    await expect(nextArrow).toBeVisible();

    // Click next to go to Jan 10
    await nextArrow.click();
    await page.waitForTimeout(500);

    // Should still be in editor view
    await expect(editor).toBeVisible();
  });
});
