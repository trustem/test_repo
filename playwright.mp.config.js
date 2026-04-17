import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'multiplayer.spec.js',
  timeout: 180000,          // 3 min per test — Firebase round-trips are slow
  workers: 1,               // Sequential: avoid Firestore room collisions
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    viewport: { width: 420, height: 900 },
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 20000,
  },
  reporter: 'list',
});
