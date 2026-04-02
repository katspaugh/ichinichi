import { test, expect } from './fixtures';

test.describe('Cloud Authentication', () => {
  const TEST_EMAIL = process.env.TEST_USER_EMAIL || '';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '';

  test.beforeEach(async ({ helpers }) => {
    await helpers.clearStorageAndReload();
  });

  test('shows either intro modal or sign in button on first load', async ({ page }) => {
    // Either the intro modal should be visible OR the calendar with sign-in button
    const hasIntroModal = await page
      .getByRole('button', { name: 'Sign in / sign up' })
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const hasSignInButton = await page
      .getByRole('button', { name: /Sign in/i })
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    expect(hasIntroModal || hasSignInButton).toBe(true);
  });

  test('can open auth modal via header button or intro modal', async ({ page }) => {
    // Try intro modal first, then fall back to header button
    const setupSyncButton = page.getByRole('button', { name: 'Sign in / sign up' });
    const signInButton = page.getByRole('button', { name: /Sign in/i });

    if (await setupSyncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await setupSyncButton.click();
    } else if (await signInButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await signInButton.click();
    }

    // Auth form should be visible
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#auth-password')).toBeVisible();
  });

  test('can toggle between sign in and sign up modes', async ({ page, helpers }) => {
    // Clear any existing auth state
    await helpers.clearStorageAndReload();

    // Open auth modal
    const setupSyncButton = page.getByRole('button', { name: 'Sign in / sign up' });
    const signInButton = page.getByRole('button', { name: /Sign in/i });

    if (await setupSyncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await setupSyncButton.click();
    } else {
      await signInButton.click();
    }

    // Wait for auth form
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    const toggleButton = page
      .locator('p')
      .filter({ hasText: /account/i })
      .getByRole('button');

    await expect(toggleButton).toBeVisible({ timeout: 3000 });
    const initialLabel = (await toggleButton.textContent())?.trim();
    await toggleButton.click();
    await expect(toggleButton).not.toHaveText(initialLabel ?? '');

    // Auth form should still be visible
    await expect(page.locator('#auth-email')).toBeVisible();
  });

  test('shows validation error for invalid email', async ({ page }) => {
    // Open auth modal
    const setupSyncButton = page.getByRole('button', { name: 'Sign in / sign up' });
    const signInButton = page.getByRole('button', { name: /Sign in/i });

    if (await setupSyncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await setupSyncButton.click();
    } else {
      await signInButton.click();
    }

    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    // Enter invalid email
    await page.locator('#auth-email').fill('invalid-email');
    await page.locator('#auth-password').fill('password123');

    // The email input should have validation
    const emailInput = page.locator('#auth-email');
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });

  test('can sign in with valid credentials', async ({ page, helpers }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Test credentials not configured');

    // Clear storage and set up local vault first (required for cloud sync)
    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault();

    // Sign in
    const signInButton = page.getByRole('button', { name: /Sign in/i });
    await signInButton.click();
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    // Switch to sign in mode if needed
    const createAccountButton = page.getByRole('button', { name: /Create an account/i });
    if (await createAccountButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      const toggleToSignIn = page
        .locator('p')
        .filter({ hasText: /account/i })
        .getByRole('button', { name: /sign in/i });
      await toggleToSignIn.click();
    }

    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('#auth-password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();

    // Wait for vault unlock modal or auto-unlock
    await page.waitForTimeout(3000);

    // Handle vault unlock if needed
    const vaultInput = page.locator('#vault-password');
    if (await vaultInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await vaultInput.fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.waitForTimeout(2000);
    }

    // Should be synced
    await expect(page.getByText('Synced')).toBeVisible({ timeout: 30000 });
  });

  test('shows sign out button when authenticated', async ({ page, helpers }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Test credentials not configured');

    // Clear storage and set up local vault first (required for cloud sync)
    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault();

    // Sign in
    const signInButton = page.getByRole('button', { name: /Sign in/i });
    await signInButton.click();
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    // Switch to sign in mode if needed
    const createAccountButton = page.getByRole('button', { name: /Create an account/i });
    if (await createAccountButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      const toggleToSignIn = page
        .locator('p')
        .filter({ hasText: /account/i })
        .getByRole('button', { name: /sign in/i });
      await toggleToSignIn.click();
    }

    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('#auth-password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();

    // Wait for vault unlock modal or auto-unlock
    await page.waitForTimeout(3000);

    // Handle vault unlock if needed
    const vaultInput = page.locator('#vault-password');
    if (await vaultInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await vaultInput.fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.waitForTimeout(2000);
    }

    // Should be synced
    await expect(page.getByText('Synced')).toBeVisible({ timeout: 10000 });

    // Sign out button should be visible in Settings panel
    await page.getByRole('button', { name: /Open settings/i }).click();
    const signOutButton = page.getByRole('button', { name: /Sign out/i }).first();
    await expect(signOutButton).toBeVisible({ timeout: 5000 });
  });

  test('can sign out', async ({ page, helpers }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Test credentials not configured');

    // Clear storage and set up local vault first (required for cloud sync)
    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault();

    // Sign in
    const signInButton = page.getByRole('button', { name: /Sign in/i });
    await signInButton.click();
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    // Switch to sign in mode if needed
    const createAccountButton = page.getByRole('button', { name: /Create an account/i });
    if (await createAccountButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      const toggleToSignIn = page
        .locator('p')
        .filter({ hasText: /account/i })
        .getByRole('button', { name: /sign in/i });
      await toggleToSignIn.click();
    }

    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('#auth-password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();

    // Wait for vault unlock modal or auto-unlock
    await page.waitForTimeout(3000);

    // Handle vault unlock if needed
    const vaultInput = page.locator('#vault-password');
    if (await vaultInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await vaultInput.fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.waitForTimeout(2000);
    }

    // Should be synced
    await expect(page.getByText('Synced')).toBeVisible({ timeout: 10000 });

    // Open settings and click sign out
    await page.getByRole('button', { name: /Open settings/i }).click();
    const signOutButton = page.getByRole('button', { name: /Sign out/i }).first();
    await signOutButton.click();

    // Close settings panel if still open
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Should show sign in button again (use exact match to avoid matching "Sign in to sync" in settings)
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Sync Status', () => {
  const TEST_EMAIL = process.env.TEST_USER_EMAIL || '';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '';

  test('shows sync indicator when authenticated', async ({ page, helpers }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Test credentials not configured');

    await helpers.clearStorageAndReload();
    await helpers.dismissIntroModal();
    await helpers.setupLocalVault();

    // Sign in
    const signInButton = page.getByRole('button', { name: /Sign in/i });
    await signInButton.click();
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    const createAccountButton = page.getByRole('button', { name: /Create an account/i });
    if (await createAccountButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      const toggleToSignIn = page
        .locator('p')
        .filter({ hasText: /account/i })
        .getByRole('button', { name: /sign in/i });
      await toggleToSignIn.click();
    }

    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('#auth-password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();

    // Wait for vault unlock modal or auto-unlock
    await page.waitForTimeout(3000);

    // Handle vault unlock if needed
    const vaultInput = page.locator('#vault-password');
    if (await vaultInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await vaultInput.fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.waitForTimeout(2000);
    }

    // Sync indicator should show some status
    await expect(page.getByText('Synced')).toBeVisible({ timeout: 30000 });
  });
});
