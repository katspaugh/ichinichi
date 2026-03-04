import { test, expect } from './fixtures';

/**
 * Local AI (Embeddings) integration tests.
 *
 * Tests verify the in-browser AI toggle and status UI in the settings sidebar.
 * The embeddings model download is not tested (requires network + WASM).
 *
 * Run:
 *   npx playwright test tests/local-ai.spec.ts --project=chromium --headed
 */

test.describe('Local AI (Embeddings)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ helpers }) => {
    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault();
  });

  test('AI is enabled by default', async ({ page }) => {
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.waitForTimeout(500);

    const toggle = page.locator('text=Enable Local AI').locator('..').getByRole('switch');
    await expect(toggle).toBeVisible({ timeout: 5_000 });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('shows model status when enabled', async ({ page }) => {
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.waitForTimeout(500);

    // AI is enabled by default — description should be visible
    const description = page.locator('text=in-browser AI model');
    await expect(description).toBeVisible({ timeout: 5_000 });
  });

  test('hides status when toggled off', async ({ page }) => {
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.waitForTimeout(500);

    const toggle = page.locator('text=Enable Local AI').locator('..').getByRole('switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Disable
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Model status should not be visible when disabled
    const downloadingStatus = page.locator('text=Downloading model');
    const readyStatus = page.locator('text=Model ready');
    await expect(downloadingStatus).not.toBeVisible();
    await expect(readyStatus).not.toBeVisible();
  });

  test('can re-enable after disabling', async ({ page }) => {
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.waitForTimeout(500);

    const toggle = page.locator('text=Enable Local AI').locator('..').getByRole('switch');

    // Disable
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Re-enable
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('description text mentions in-browser AI', async ({ page }) => {
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.waitForTimeout(500);

    const description = page.locator('[class*="aiDescription"]');
    await expect(description).toBeVisible({ timeout: 5_000 });
    await expect(description).toContainText('in-browser');
    await expect(description).toContainText('never leaves your device');
  });
});
