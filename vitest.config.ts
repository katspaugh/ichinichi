import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "virtual:pwa-register/react": resolve(
        __dirname,
        "src/__tests__/helpers/pwaStub.ts",
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.claude/**", "**/.worktrees/**"],
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});
