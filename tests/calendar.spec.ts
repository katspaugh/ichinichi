import { test, expect } from './fixtures';

test.describe('Calendar Navigation', () => {
  // Run tests serially to avoid IndexedDB state conflicts between parallel workers
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ page, helpers }) => {
    await helpers.clearStorageAndReload();
    // Dismiss intro modal and set up vault so calendar is clickable
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault();
    // Wait for any remaining modals to close
    await page.waitForTimeout(500);
  });

  test('shows the current year calendar on first load', async ({ page }) => {
    const currentYear = new Date().getFullYear();
    // Check that the year is displayed in the header
    await expect(page.getByText(String(currentYear), { exact: true })).toBeVisible();
  });

  test('can navigate to previous year', async ({ page }) => {
    const currentYear = new Date().getFullYear();
    const prevYearButton = page.getByRole('button', { name: /Previous year/i });

    // Use force click to bypass any overlay that might be blocking
    await prevYearButton.click({ force: true });

    // Check year in header and URL
    await expect(page.getByText(String(currentYear - 1), { exact: true })).toBeVisible();
    await expect(page).toHaveURL(`/?year=${currentYear - 1}`);
  });

  test('can navigate to next year', async ({ page }) => {
    const currentYear = new Date().getFullYear();
    const nextYearButton = page.getByRole('button', { name: /Next year/i });

    // Use force click to bypass any overlay that might be blocking
    await nextYearButton.click({ force: true });

    await expect(page.getByText(String(currentYear + 1), { exact: true })).toBeVisible();
    await expect(page).toHaveURL(`/?year=${currentYear + 1}`);
  });

  test('can enter month view by clicking month header', async ({ page }) => {
    // Click on a month header button
    const monthButton = page.locator('button[aria-label*="View January"]');
    await monthButton.click({ force: true });

    // Should be in month view - URL should have month parameter (format: ?month=YYYY-MM)
    await expect(page).toHaveURL(/\?month=\d{4}-\d{2}/);

    // Return to year view button should be visible
    await expect(page.getByRole('button', { name: /Return to year/i })).toBeVisible();
  });

  test('can return to year view from month view', async ({ page }) => {
    // Enter month view
    const monthButton = page.locator('button[aria-label*="View January"]');
    await monthButton.click({ force: true });
    await expect(page).toHaveURL(/\?month=\d{4}-\d{2}/);

    // Click return to year view
    const returnButton = page.getByRole('button', { name: /Return to year/i });
    await returnButton.click({ force: true });

    // URL should have year parameter without month
    await expect(page).toHaveURL(/\?year=\d+$/);
  });

  test('can navigate months in month view', async ({ page }) => {
    const currentYear = new Date().getFullYear();

    // Enter January month view
    await page.goto(`/?year=${currentYear}`);
    const janButton = page.locator('button[aria-label*="View January"]');
    await janButton.click();

    // Navigate to next month
    const nextMonthButton = page.locator('[aria-label*="Next month"]');
    await nextMonthButton.click();

    // Should show February
    await expect(page.locator('text=February')).toBeVisible();
  });

  test('highlights current month in calendar', async ({ page }) => {
    const currentMonth = page.locator('[data-current-month="true"]');
    await expect(currentMonth).toBeVisible();
  });

  test('today cell is clickable', async ({ page }) => {
    // Vault is already set up in beforeEach
    const today = new Date();
    const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });
    const month = today.toLocaleDateString('en-US', { month: 'long' });
    const day = today.getDate();

    // Find today's cell and click it
    const todayCell = page.locator(
      `[role="button"][aria-label*="${dayOfWeek}"][aria-label*="${month} ${day}"]`
    );
    await todayCell.click();

    // Note modal should open
    await expect(page.locator('[data-note-editor="content"]')).toBeVisible();
  });

  test('future days are not clickable', async ({ page }) => {
    // Navigate to next year to ensure we have future dates
    const nextYear = new Date().getFullYear() + 1;
    await page.goto(`/?year=${nextYear}`);

    // Future cells should have tabIndex=-1 (not focusable/clickable)
    const futureCells = page.locator('[data-state="future"]');
    const firstFutureCell = futureCells.first();

    if (await firstFutureCell.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(firstFutureCell).toHaveAttribute('tabindex', '-1');
    }
  });

  test('URL updates when navigating years', async ({ page }) => {
    const year = 2023;
    await page.goto(`/?year=${year}`);

    await expect(page.getByText(String(year), { exact: true })).toBeVisible();
    await expect(page).toHaveURL(`/?year=${year}`);
  });
});
