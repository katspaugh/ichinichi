import { test, expect } from './fixtures';

test.describe('Calendar Navigation', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ page, helpers }) => {
    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault();
    await page.waitForTimeout(500);
  });

  test('shows the current year calendar on first load', async ({ page }) => {
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(String(currentYear), { exact: true })).toBeVisible();
  });

  test('can navigate to previous year', async ({ page }) => {
    const currentYear = new Date().getFullYear();
    const prevYearButton = page.getByRole('button', { name: /Previous year/i });
    await prevYearButton.click({ force: true });
    await expect(page.getByText(String(currentYear - 1), { exact: true })).toBeVisible();
    await expect(page).toHaveURL(`/?year=${currentYear - 1}`);
  });

  test('clicking month with no notes stays in year view', async ({ page }) => {
    const monthButton = page.locator('button[aria-label*="View January"]');
    await monthButton.click({ force: true });
    // Month click navigates to latest note in month; with no notes, stays in year view
    await expect(page).not.toHaveURL(/\?date=/);
    // Year heading still visible
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(String(currentYear), { exact: true })).toBeVisible();
  });

  test('today cell is clickable and opens note editor', async ({ page }) => {
    const today = new Date();
    const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });
    const month = today.toLocaleDateString('en-US', { month: 'long' });
    const day = today.getDate();

    const todayCell = page.locator(
      `[role="button"][aria-label*="${dayOfWeek}"][aria-label*="${month} ${day}"]`
    );
    await todayCell.click();
    await expect(page.locator('[data-note-editor="content"]')).toBeVisible();
  });
});
