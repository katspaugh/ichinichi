import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error -- no published types for vite-plugin-sri
import sri from 'vite-plugin-sri'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sri()],
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
