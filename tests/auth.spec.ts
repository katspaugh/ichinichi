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
      .getByRole('button', { name: 'Start writing' })
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
    const setupSyncButton = page.getByRole('button', { name: 'Set up sync' });
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

  test('can toggle between sign in and sign up modes', async ({ page }) => {
    // Open auth modal
    const setupSyncButton = page.getByRole('button', { name: 'Set up sync' });
    const signInButton = page.getByRole('button', { name: /Sign in/i });

    if (await setupSyncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await setupSyncButton.click();
    } else {
      await signInButton.click();
    }

    // Wait for auth form
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    // Look for toggle button - could be "Already have an account? Sign in" or "Create an account"
    const alreadyHaveButton = page.getByRole('button', { name: /Already have an account/i });
    const createAccountButton = page.getByRole('button', { name: /Create an account/i });

    const hasAlreadyHave = await alreadyHaveButton.isVisible({ timeout: 1000 }).catch(() => false);
    const hasCreateAccount = await createAccountButton.isVisible({ timeout: 1000 }).catch(() => false);

    expect(hasAlreadyHave || hasCreateAccount).toBe(true);

    // Click whichever is visible
    if (hasAlreadyHave) {
      await alreadyHaveButton.click();
      // After clicking, should see Create an account
      await expect(createAccountButton).toBeVisible({ timeout: 3000 });
    } else if (hasCreateAccount) {
      await createAccountButton.click();
      // After clicking, should see Already have an account
      await expect(alreadyHaveButton).toBeVisible({ timeout: 3000 });
    }

    // Auth form should still be visible
    await expect(page.locator('#auth-email')).toBeVisible();
  });

  test('shows validation error for invalid email', async ({ page }) => {
    // Open auth modal
    const setupSyncButton = page.getByRole('button', { name: 'Set up sync' });
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

  test('can sign in with valid credentials', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Test credentials not configured');

    // Open auth modal
    const setupSyncButton = page.getByRole('button', { name: 'Set up sync' });
    const signInButton = page.getByRole('button', { name: /Sign in/i });

    if (await setupSyncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await setupSyncButton.click();
    } else {
      await signInButton.click();
    }

    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    // Switch to sign in mode if needed
    const signInToggle = page.getByRole('button', { name: /Already have an account/i });
    if (await signInToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
      await signInToggle.click();
    }

    // Fill credentials
    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('#auth-password').fill(TEST_PASSWORD);

    // Submit
    await page.getByRole('button', { name: /sign in/i }).first().click();

    // Wait for auth to complete
    await page.waitForTimeout(3000);

    // Should now see the calendar with sign out button or vault unlock modal
    const hasSignOut = await page
      .getByRole('button', { name: /Sign out/i })
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const hasVaultModal = await page
      .locator('#vault-password')
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    expect(hasSignOut || hasVaultModal).toBe(true);
  });

  test('shows sign out button when authenticated', async ({ page, helpers }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Test credentials not configured');

    // Open auth modal
    const setupSyncButton = page.getByRole('button', { name: 'Set up sync' });
    const signInButton = page.getByRole('button', { name: /Sign in/i });

    if (await setupSyncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await setupSyncButton.click();
    } else {
      await signInButton.click();
    }

    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    const signInToggle = page.getByRole('button', { name: /Already have an account/i });
    if (await signInToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
      await signInToggle.click();
    }

    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('#auth-password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();

    // Handle vault unlock if needed
    const vaultInput = page.locator('#vault-password');
    if (await vaultInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await vaultInput.fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /unlock/i }).click();
    }

    // Wait for app to be ready
    await page.waitForTimeout(2000);
    await helpers.waitForAppReady();

    // Sign out button should be visible in header
    const signOutButton = page.getByRole('button', { name: /Sign out/i });
    await expect(signOutButton).toBeVisible({ timeout: 10000 });
  });

  test('can sign out', async ({ page, helpers }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Test credentials not configured');

    // Open auth modal
    const setupSyncButton = page.getByRole('button', { name: 'Set up sync' });
    const signInButton = page.getByRole('button', { name: /Sign in/i });

    if (await setupSyncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await setupSyncButton.click();
    } else {
      await signInButton.click();
    }

    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    const signInToggle = page.getByRole('button', { name: /Already have an account/i });
    if (await signInToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
      await signInToggle.click();
    }

    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('#auth-password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();

    // Handle vault unlock if needed
    const vaultInput = page.locator('#vault-password');
    if (await vaultInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await vaultInput.fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /unlock/i }).click();
    }

    await page.waitForTimeout(2000);
    await helpers.waitForAppReady();

    // Click sign out
    const signOutButton = page.getByRole('button', { name: /Sign out/i });
    await signOutButton.click();

    // Should show sign in button again
    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Sync Status', () => {
  const TEST_EMAIL = process.env.TEST_USER_EMAIL || '';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '';

  test('shows sync indicator when authenticated', async ({ page, helpers }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Test credentials not configured');

    await helpers.clearStorageAndReload();

    // Open auth modal
    const setupSyncButton = page.getByRole('button', { name: 'Set up sync' });
    const signInButton = page.getByRole('button', { name: /Sign in/i });

    if (await setupSyncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await setupSyncButton.click();
    } else {
      await signInButton.click();
    }

    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });

    const signInToggle = page.getByRole('button', { name: /Already have an account/i });
    if (await signInToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
      await signInToggle.click();
    }

    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('#auth-password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();

    // Handle vault unlock if needed
    const vaultInput = page.locator('#vault-password');
    if (await vaultInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await vaultInput.fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /unlock/i }).click();
    }

    await helpers.waitForAppReady();

    // Sync indicator should show some status
    const syncIndicator = page.locator('[class*="sync"]');
    await expect(syncIndicator.first()).toBeVisible({ timeout: 10000 });
  });
});
