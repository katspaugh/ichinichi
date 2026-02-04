import { test as base, expect } from '@playwright/test';

/**
 * Test fixtures and helpers for Ichinichi e2e tests
 */

export interface TestHelpers {
  /**
   * Clear all IndexedDB databases and reload to start fresh
   */
  clearStorageAndReload: () => Promise<void>;

  /**
   * Get today's date in DD-MM-YYYY format
   */
  getTodayDate: () => string;

  /**
   * Format a date to DD-MM-YYYY
   */
  formatDate: (date: Date) => string;

  /**
   * Wait for the app to be ready (no loading states)
   */
  waitForAppReady: () => Promise<void>;

  /**
   * Dismiss the intro modal if present
   */
  dismissIntroModal: () => Promise<void>;

  /**
   * Set up a local vault (handles auto-creation or password prompt)
   */
  setupLocalVault: (password?: string) => Promise<void>;

  /**
   * Open a note for a specific date
   */
  openNote: (date: string) => Promise<void>;

  /**
   * Close the current note modal
   */
  closeNoteModal: () => Promise<void>;

  /**
   * Type content into the note editor
   */
  typeInEditor: (content: string) => Promise<void>;

  /**
   * Get the content of the note editor
   */
  getEditorContent: () => Promise<string>;

  /**
   * Wait for the note to be saved
   */
  waitForSave: () => Promise<void>;

  /**
   * Sign in with cloud credentials
   */
  signIn: (email: string, password: string) => Promise<void>;

  /**
   * Wait until the vault is unlocked in the app shell
   */
  waitForVaultUnlocked: () => Promise<void>;

  /**
   * Sign out from cloud
   */
  signOut: () => Promise<void>;

  /**
   * Navigate to a specific year in the calendar
   */
  navigateToYear: (year: number) => Promise<void>;

  /**
   * Click on a day cell
   */
  clickDay: (day: number, month?: string) => Promise<void>;
}

export const test = base.extend<{ helpers: TestHelpers }>({
  helpers: async ({ page }, use) => {
    const helpers: TestHelpers = {
      clearStorageAndReload: async () => {
        // Clear cookies first (including Supabase auth cookies)
        await page.context().clearCookies();

        // Navigate to app first to have access to storage APIs
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        // Clear all storage
        await page.evaluate(async () => {
          // Clear known IndexedDB databases used by the app
          const knownDatabases = [
            'dailynotes-unified',
            'dailynotes-vault',
            'dailynotes-local',
            'dailynotes-synced',
          ];

          // Delete databases and wait for completion
          const deletePromises = knownDatabases.map(dbName => {
            return new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(dbName);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve(); // Resolve even on error
              request.onblocked = () => resolve(); // Resolve if blocked
            });
          });

          await Promise.all(deletePromises);

          // Clear localStorage
          localStorage.clear();
          // Clear sessionStorage
          sessionStorage.clear();
        });

        // Navigate to app again (not reload) to start fresh with cleared storage
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        // Wait for app to be fully hydrated (intro modal or calendar visible)
        await page.waitForFunction(() => {
          const hasIntro = document.body.textContent?.includes('Welcome to Ichinichi');
          const hasCalendar = document.body.textContent?.match(/20[0-9]{2}/);
          return hasIntro || hasCalendar;
        }, { timeout: 15000 });
      },

      getTodayDate: () => {
        const today = new Date();
        return helpers.formatDate(today);
      },

      formatDate: (date: Date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      },

      waitForAppReady: async () => {
        // Wait for any loading indicators to disappear
        await page.waitForFunction(
          () => {
            const body = document.body;
            return (
              !body.textContent?.includes('Loading') &&
              !body.textContent?.includes('Decrypting')
            );
          },
          { timeout: 15000 }
        );
      },

      dismissIntroModal: async () => {
        const maybeLaterButton = page.getByRole('button', { name: 'Maybe later' });
        if (await maybeLaterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await maybeLaterButton.click();
        }
        // Wait for vault to be unlocked (needed to interact with notes)
        await helpers.waitForVaultUnlocked();
      },

      setupLocalVault: async (password?: string) => {
        // Wait for potential vault modal
        await page.waitForTimeout(500);

        // Check if vault password prompt appears
        const passwordInput = page.locator('#vault-password');
        if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          if (password) {
            await passwordInput.fill(password);
          } else {
            // Use a default test password
            await passwordInput.fill('testpassword123');
          }
          await page.getByRole('button', { name: /Create vault|Unlock/i }).click();
          await page.waitForTimeout(1000);
        }

        // Wait for app to be ready
        await helpers.waitForAppReady();

        // Close ALL open modals aggressively (multiple types might appear)
        for (let attempt = 0; attempt < 5; attempt++) {
          await page.waitForTimeout(300);

          // Check for any modal backdrop
          const backdrop = page.locator('[class*="Modal__backdrop"]');
          if (!(await backdrop.isVisible({ timeout: 200 }).catch(() => false))) {
            break; // No modal visible, we're done
          }

          // Try close button first
          const closeButton = page.locator('button:has-text("✕")');
          if (await closeButton.isVisible({ timeout: 200 }).catch(() => false)) {
            await closeButton.click();
            await page.waitForTimeout(300);
            continue;
          }

          // Try "Keep it local" button (mode choice modal)
          const keepLocalButton = page.getByRole('button', { name: /Keep it local/i });
          if (await keepLocalButton.isVisible({ timeout: 200 }).catch(() => false)) {
            await keepLocalButton.click();
            await page.waitForTimeout(300);
            continue;
          }

          // Try Escape key as fallback
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }

        // Final wait for stability
        await page.waitForTimeout(200);
      },

      openNote: async (date: string) => {
        await page.goto(`/?date=${date}`);
        await helpers.waitForAppReady();
      },

      closeNoteModal: async () => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      },

      typeInEditor: async (content: string) => {
        const editor = page.locator('[data-note-editor="content"]');
        await editor.click();
        await page.keyboard.press('Meta+a');
        await page.keyboard.type(content);
      },

      getEditorContent: async () => {
        const editor = page.locator('[data-note-editor="content"]');
        return editor.innerText();
      },

      waitForSave: async () => {
        // Wait a bit for debounced save to kick in and complete
        await page.waitForTimeout(3500);
        // Try to wait for "Saving..." to disappear if it appears
        try {
          const savingText = page.getByText('Saving...');
          if (await savingText.isVisible({ timeout: 500 }).catch(() => false)) {
            await savingText.waitFor({ state: 'hidden', timeout: 5000 });
          }
        } catch {
          // If "Saving..." doesn't appear, the save was instant or already done
        }
      },

      signIn: async (email: string, password: string) => {
        // Click sign in button if visible
        const signInButton = page.getByRole('button', { name: /Sign in/i });
        if (await signInButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await signInButton.click();
        }

        // Fill in credentials
        await page.locator('#auth-email').fill(email);
        await page.locator('#auth-password').fill(password);
        await page.getByRole('button', { name: /Sign in/i }).click();

        // Wait for auth to complete
        await page.waitForFunction(
          () => {
            return !document.body.textContent?.includes('Signing in');
          },
          { timeout: 30000 }
        );
      },

      waitForVaultUnlocked: async () => {
        await expect.poll(async () => {
          return page.evaluate(
            () => document.documentElement.dataset.vaultUnlocked ?? "false"
          );
        }, {
          timeout: 15000,
        }).toBe("true");
      },

      signOut: async () => {
        const signOutButton = page.getByRole('button', { name: /Sign out/i });
        if (await signOutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await signOutButton.click();
        }
      },

      navigateToYear: async (year: number) => {
        await page.goto(`/?year=${year}`);
        await helpers.waitForAppReady();
      },

      clickDay: async (day: number, month?: string) => {
        let selector = `[role="button"][aria-label*="${day},"]`;
        if (month) {
          selector = `[role="button"][aria-label*="${month}"][aria-label*="${day},"]`;
        }
        const editor = page.locator('[data-note-editor="content"]');
        await expect
          .poll(
            async () => {
              await page.locator(selector).first().click();
              return editor.isVisible();
            },
            { timeout: 15000 }
          )
          .toBe(true);
      },
    };

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(helpers);
  },
});

export { expect };
