import { defineConfig } from "vite";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { sriPlugin } from "./viteSriPlugin";

const isTauri = !!process.env.TAURI_ENV_PLATFORM;

const __dirname = dirname(fileURLToPath(import.meta.url));

const commitHash = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
})();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    !isTauri &&
      VitePWA({
        registerType: "prompt",
        includeAssets: [
          "favicons/favicon.ico",
          "favicons/apple-touch-icon.png",
          "favicons/android-chrome-192x192.png",
          "favicons/android-chrome-512x512.png",
        ],
        manifest: false,
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/api/],
          importScripts: ["/share-target-sw.js"],
        },
        devOptions: {
          enabled: false,
        },
      }),
    sriPlugin(),
  ],
  css: {
    modules: {
      generateScopedName: (name, filename) => {
        const fileBase = basename(filename).replace(/\.module\.[^.]+$/, "");
        const hash = createHash("md5")
          .update(`${filename}:${name}`)
          .digest("base64")
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 5);
        return `${fileBase}__${name}___${hash}`;
      },
    },
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      ...(isTauri && {
        "virtual:pwa-register/react": resolve(
          __dirname,
          "src/stubs/pwaRegister.ts",
        ),
      }),
    },
  },
  build: {
    // Optimize chunks for better caching
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom") ||
              id.includes("node_modules/react/")) {
            return "react-vendor";
          }
        },
      },
    },
    // Generate sourcemaps for production debugging (optional)
    sourcemap: false,
    // Use esbuild for fast minification (default)
    minify: "esbuild",
  },
});
