import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  base: '',

  define: {
    'process.env.TARGET': JSON.stringify('firefox'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Use relative base so moz-extension:// paths resolve correctly
    assetsDir: 'assets',

    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
      },
      output: {
        // Flat asset names — easier to reference from manifest
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Use classic script format for Firefox MV2 compatibility
        format: 'iife',
      },
    },
  },
});
