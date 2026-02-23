/**
 * vite.config.firefox.ts
 *
 * Builds TabSync popup for Firefox using plain Vite (no CRXJS).
 * The background script is built separately via vite.config.firefox.bg.ts
 * because Firefox MV2 background.scripts are classic scripts (no ES modules).
 *
 * The Firefox manifest.json is written by scripts/pack.js after both builds.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export default defineConfig({
  plugins: [react()],

  define: {
    'process.env.TARGET': JSON.stringify('firefox'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },

  build: {
    outDir: 'dist-firefox',
    emptyOutDir: true,

    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
