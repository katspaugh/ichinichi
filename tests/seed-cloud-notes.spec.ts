/**
 * Seed script to generate test notes in CLOUD mode.
 * Run once with: yarn test:e2e:seed
 */

import { test, expect } from './fixtures';

const TEST_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '';

const SEED_YEAR = new Date().getFullYear() - 1;
const SEEDED_DAYS = [1, 5, 10, 15];
const SEEDED_DATES = SEEDED_DAYS.map(
  (day) => `${String(day).padStart(2, '0')}-01-${SEED_YEAR}`
);
const SEED_MONTH_NAME = 'January';

function noteContentForDate(date: string): string {
  return `Seeded cloud note for ${date}

These notes are pre-seeded for e2e tests.
Generated at: ${new Date().toISOString()}`;
}

test.describe('Seed Cloud Notes', () => {
  test('seed: create cloud notes for fixed dates', async ({ page, helpers }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Test credentials not configured');

    await helpers.clearStorageAndReload();

    await page.evaluate(() => {
      localStorage.setItem('dailynote_allow_past_edit', '1');
    });

    await helpers.dismissIntroModal();
    await helpers.setupLocalVault(TEST_PASSWORD);

    const signInButton = page.getByRole('button', { name: /Sign in/i });
    await signInButton.click();
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    const signInToggle = page.getByRole('button', { name: /Already have an account/i });
    if (await signInToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
      await signInToggle.click();
    }

    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('#auth-password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();

    await expect(page.getByText('Synced')).toBeVisible({ timeout: 10000 });

    await helpers.navigateToYear(SEED_YEAR);

    for (const date of SEEDED_DATES) {
      const day = Number(date.slice(0, 2));
      await helpers.clickDay(day, SEED_MONTH_NAME);

      const editor = page.locator('[data-note-editor="content"]');
      await expect(editor).toBeVisible({ timeout: 10000 });
      await expect(editor).toHaveAttribute('contenteditable', 'true', {
        timeout: 5000,
      });

      await helpers.typeInEditor(noteContentForDate(date));
      await helpers.waitForSave();

      await helpers.closeNoteModal();

      await expect(page.getByText('Synced')).toBeVisible({ timeout: 10000 });
    }

    await page.evaluate(() => {
      localStorage.removeItem('dailynote_allow_past_edit');
    });

    await helpers.navigateToYear(SEED_YEAR);
    const cellsWithNotes = page.locator('[aria-label*="has note"]');
    await expect.poll(async () => cellsWithNotes.count(), {
      timeout: 15000,
    }).toBeGreaterThanOrEqual(4);
  });
});
