import { test as setup } from './fixtures';

/**
 * Global setup for Playwright tests
 * This runs once before all tests in the setup project
 */
setup('verify app is accessible', async ({ page }) => {
  // Navigate to the app to ensure it's running
  await page.goto('/');

  // Wait for the app to load (either intro modal or calendar)
  await page.waitForFunction(() => {
    const hasIntro = document.body.textContent?.includes('Start writing');
    const hasCalendar = document.body.textContent?.match(/20[0-9]{2}/);
    return hasIntro || hasCalendar;
  }, { timeout: 30000 });
});
