import { defineConfig, devices } from "@playwright/experimental-ct-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./src/__tests__/ct",
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "html",

  use: {
    ...devices["Desktop Chrome"],
    ctViteConfig: {
      resolve: {
        alias: {
          "@": resolve(__dirname, "./src"),
        },
      },
    },
  },
});
