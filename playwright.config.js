import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'file:///Users/rustem/Bardak%20project/durak/index.html',
    headless: true,
    viewport: { width: 1280, height: 800 }, // desktop
  },
  reporter: 'list',
});
