import path from 'node:path';
import { defineConfig } from '@playwright/test';

if (process.env.T02_TASK !== 't14' || process.env.T02_TEST_ORIGIN !== 'http://127.0.0.1:4310') {
  throw new Error('O QA real deve ser iniciado pelo comando test:web:real, no domínio de integração T14.');
}
export default defineConfig({
  testDir: './tests/pilot-browser', testMatch: '*.spec.ts', fullyParallel: false,
  workers: 1, retries: 0, forbidOnly: true, timeout: 180_000, reporter: 'list',
  outputDir: path.resolve('../.artifacts/t14-runtime/reports/browser'),
  use: { baseURL: process.env.T02_TEST_ORIGIN, browserName: 'chromium', viewport: { width: 390, height: 844 },
    actionTimeout: 15_000, navigationTimeout: 20_000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
