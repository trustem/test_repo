import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Use VITE_BASE env var for GH Pages, default '/' for iOS/Capacitor
  base: process.env.VITE_BASE || '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
});
