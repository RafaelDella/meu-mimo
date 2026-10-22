import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4301', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium320', use: { browserName: 'chromium', viewport: { width: 320, height: 800 } } },
    { name: 'chromium390', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:4301',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  },
});
