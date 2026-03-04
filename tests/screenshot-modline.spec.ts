import { test } from './fixtures';

test.describe.configure({ mode: 'serial' });

test('screenshot modline dark mode', async ({ page, helpers }) => {
  await helpers.clearStorageAndReload();
  await helpers.dismissIntroModal();
  await helpers.setupLocalVault();

  // Set dark mode
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  // Open today's note
  const today = new Date();
  const day = today.getDate();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[today.getMonth()];

  // Click on today
  await page.locator(`button[aria-label*="${monthName}"][aria-label*="${day},"]`).click();
  await page.waitForTimeout(1000);

  // Type some content to trigger save
  const editor = page.locator('[data-note-editor="content"]');
  await editor.click();
  await page.keyboard.type('Had a productive morning coding session. Went for a walk in the park after lunch. Feeling calm and focused today.');
  await page.waitForTimeout(500);

  // Inject fake AI meta to show modline tags
  await page.evaluate(() => {
    // Find the modline store and inject test data
    const event = new CustomEvent('__test_inject_ai_meta', {
      detail: { tags: ['coding', 'walking', 'park', 'calm', 'focus'] }
    });
    window.dispatchEvent(event);
  });

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/modline-dark.png', fullPage: false });
});
</test>
