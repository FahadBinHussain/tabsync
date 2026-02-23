/**
 * vite.config.firefox.bg.ts
 *
 * Builds the background script for Firefox as a self-contained IIFE.
 *
 * Firefox MV2 `background.scripts` loads scripts as CLASSIC scripts — ES
 * module `import` statements are not allowed.  We use Vite's library mode
 * with format:'iife' to produce a single background.js with ALL dependencies
 * inlined and no `import`/`export` at the top level.
 *
 * Output goes into dist-firefox/ (alongside the popup built by
 * vite.config.firefox.ts) so everything ends up in the same directory.
 */

import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export default defineConfig({
  define: {
    'process.env.TARGET': JSON.stringify('firefox'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },

  build: {
    // Append into existing dist-firefox — do NOT wipe it (popup already there)
    outDir: 'dist-firefox',
    emptyOutDir: false,

    lib: {
      entry:  resolve(__dirname, 'src/background/index.ts'),
      name:   'TabSyncBackground',
      formats: ['iife'],
      fileName: () => 'background.js',
    },

    rollupOptions: {
      // No external deps — inline everything so the script is self-contained
      external: [],
      output: {
        // Rollup IIFE wraps everything; make sure no imports leak out
        inlineDynamicImports: true,
      },
    },
  },
});
