/**
 * Seed script to generate test notes in LOCAL mode
 * Run once with: npx playwright test tests/seed-notes.spec.ts --project=chromium --headed
 *
 * This creates a note for today in local mode.
 * Since past notes cannot be edited, we can only seed today's note.
 *
 * Note: The local data is stored in IndexedDB and persists between test runs
 * on the same browser profile.
 */

import { test, expect } from './fixtures';

// Test note content for today (only today is editable)
const TODAY_NOTE_CONTENT = `Test note created on ${new Date().toLocaleDateString()}

This is automated test data for the DailyNotes e2e test suite.

Key points:
- Calendar navigation works
- Note editing is functional
- Local storage is operational

Generated at: ${new Date().toISOString()}`;

test.describe('Seed Local Notes', () => {
  test('seed: create today\'s note in local mode', async ({ page, helpers }) => {
    // Clear storage and start fresh
    await helpers.clearStorageAndReload();

    // Dismiss intro modal if it appears
    await helpers.dismissIntroModal();

    // Set up local vault (no password needed for automatic device key)
    await helpers.setupLocalVault();

    // Wait for app to be ready
    await page.waitForTimeout(1000);

    // Click on today's cell to open the note
    const today = new Date();
    const day = today.getDate();

    // Find today's cell - it should be clickable in local mode
    const todayCell = page.getByRole('button', { name: new RegExp(`January ${day}, 2026`) });

    console.log(`Looking for today's cell (January ${day})`);
    await todayCell.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Found today cell');

    // Click to open the note
    await todayCell.click();
    console.log('✓ Clicked today cell');

    // Wait for the note modal and editor to appear
    const editor = page.locator('[data-note-editor="content"]');
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ Editor is visible');

    // Create/update today's note
    await editor.click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type(TODAY_NOTE_CONTENT);

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Verify the note indicator appears on calendar
    const cellWithNote = page.locator('[aria-label*="has note"]');
    await expect(cellWithNote.first()).toBeVisible({ timeout: 5000 });

    console.log('✓ Note indicator visible on calendar');
    console.log('✓ Created today\'s note in local mode');
    console.log('\nSeed complete! Data stored in local IndexedDB.');
  });
});
