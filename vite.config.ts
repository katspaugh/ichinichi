import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { sriPlugin } from './viteSriPlugin'

const commitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
})()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sriPlugin()],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  build: {
    // Optimize chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
    // Generate sourcemaps for production debugging (optional)
    sourcemap: false,
    // Use esbuild for fast minification (default)
    minify: 'esbuild',
  },
})
