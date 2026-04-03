import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const maxEffects = require("./eslint-rules/max-effects.cjs");

export default defineConfig([
  globalIgnores(["dist", ".claude/worktrees"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },

  // ── Layer boundary rules ──────────────────────────────────────────
  // Uses @typescript-eslint/no-restricted-imports to allow type-only imports.
  // Components may only import from controllers, contexts, hooks, types, utils.
  // Exceptions: NoteEditor imports editor services (tightly coupled by design).
  {
    files: ["src/components/**/*.{ts,tsx}"],
    ignores: ["src/components/NoteEditor/**", "src/components/AppBootstrap.tsx"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/storage/*", "**/storage"], message: "Components cannot import from storage layer.", allowTypeImports: true },
            { group: ["**/stores/*", "**/stores"], message: "Components cannot import from stores directly — use hooks.", allowTypeImports: true },
            { group: ["**/domain/*", "**/domain"], message: "Components cannot import from domain layer.", allowTypeImports: true },
            { group: ["**/lib/*", "**/lib"], message: "Components cannot import from lib — use a service or context.", allowTypeImports: true },
          ],
        },
      ],
    },
  },
  // NoteEditor: allow services (editor-specific), block storage/stores/domain/lib
  {
    files: ["src/components/NoteEditor/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/storage/*", "**/storage"], message: "Components cannot import from storage layer.", allowTypeImports: true },
            { group: ["**/stores/*", "**/stores"], message: "Components cannot import from stores directly — use hooks.", allowTypeImports: true },
            { group: ["**/domain/*", "**/domain"], message: "Components cannot import from domain layer.", allowTypeImports: true },
            { group: ["**/lib/*", "**/lib"], message: "Components cannot import from lib — use a service or context.", allowTypeImports: true },
          ],
        },
      ],
    },
  },
  // Domain must not depend on UI, controllers, hooks, or stores.
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/components/*", "**/components"], message: "Domain cannot import from components.", allowTypeImports: true },
            { group: ["**/controllers/*", "**/controllers"], message: "Domain cannot import from controllers.", allowTypeImports: true },
            { group: ["**/hooks/*", "**/hooks"], message: "Domain cannot import from hooks.", allowTypeImports: true },
            { group: ["**/stores/*", "**/stores"], message: "Domain cannot import from stores.", allowTypeImports: true },
          ],
        },
      ],
    },
  },
  // Stores must not depend on UI, controllers, or hooks.
  {
    files: ["src/stores/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/components/*", "**/components"], message: "Stores cannot import from components.", allowTypeImports: true },
            { group: ["**/controllers/*", "**/controllers"], message: "Stores cannot import from controllers.", allowTypeImports: true },
            { group: ["**/hooks/*", "**/hooks"], message: "Stores cannot import from hooks.", allowTypeImports: true },
          ],
        },
      ],
    },
  },

  // ── Max useEffect rule ────────────────────────────────────────────
  // Encourages phase-gated reducers over useEffect chains.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { local: { rules: { "max-effects": maxEffects } } },
    rules: {
      "local/max-effects": ["warn", { warn: 6, error: 8 }],
    },
  },
]);
