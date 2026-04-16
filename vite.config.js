import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

// Compute a real content-hash of main.css so asset filenames change when CSS changes.
// (Vite's built-in [hash] for CSS is module-graph-based and doesn't update on content changes.)
const cssRaw = readFileSync('./src/styles/main.css');
const cssHash = createHash('sha1').update(cssRaw).digest('base64url').slice(0, 8);

export default defineConfig({
  plugins: [react()],
  // Use VITE_BASE env var for GH Pages, default '/' for iOS/Capacitor
  base: process.env.VITE_BASE || '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // CSS gets a real content-hash so browsers always reload when styles change
        assetFileNames: (info) =>
          info.name?.endsWith('.css')
            ? `assets/[name]-${cssHash}[extname]`
            : 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 3000,
  },
});
