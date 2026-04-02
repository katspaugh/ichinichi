import { test, expect } from '@playwright/test';

test('app loads without crashing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).not.toBeEmpty();
});
