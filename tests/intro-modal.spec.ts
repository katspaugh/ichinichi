import { test, expect } from './fixtures';

test.describe('Intro Modal', () => {
  test('is full-screen and scrollable on mobile', async ({ page, helpers }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await helpers.clearStorageAndReload();

    const title = page.getByRole('heading', { name: 'Welcome to Ichinichi' });
    await expect(title).toBeVisible();

    const card = page.locator('[data-full-screen-mobile="true"][data-max-width]');
    await expect(card).toBeVisible();

    const metrics = await card.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      return {
        height: Math.round(rect.height),
        viewportHeight: window.innerHeight,
        overflowY: styles.overflowY,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });

    const heightDelta = Math.abs(metrics.height - metrics.viewportHeight);
    expect(heightDelta).toBeLessThanOrEqual(1);
    expect(['auto', 'scroll']).toContain(metrics.overflowY);
    expect(metrics.scrollHeight).toBeGreaterThanOrEqual(metrics.clientHeight);
  });
});
