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

  test('clicking month header navigates to latest note in that month', async ({ page, helpers }) => {
    // Seed a note for today so the current month has a note to navigate to
    const todayDate = helpers.getTodayDate();
    await helpers.openNote(todayDate);
    await helpers.typeInEditor('Note for month click test');
    await helpers.waitForSave();

    // Go back to calendar
    const currentYear = new Date().getFullYear();
    await page.goto(`/?year=${currentYear}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Click on the current month header
    const currentMonthName = new Date().toLocaleDateString('en-US', { month: 'long' });
    const monthButton = page.locator(`button[aria-label*="View ${currentMonthName}"]`);
    await monthButton.click({ force: true });

    // Should navigate to the day view with today's date
    await expect(page).toHaveURL(new RegExp(`\\?date=${todayDate}`));
    await expect(page.locator('[data-note-editor="content"]')).toBeVisible();
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

    // Note editor should open (inline day view)
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
