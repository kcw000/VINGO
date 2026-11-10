import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { artifacts, baseURL } from './paths.mjs';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 20000,
  expect: { timeout: 4000 },
  outputDir: path.join(artifacts, 'results'),
  reporter: [
    ['./reporter.mjs'],
    ['json', { outputFile: path.join(artifacts, 'results.json') }],
  ],
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL,
    viewport: { width: 390, height: 844 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'node scripts/server.mjs',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 10000,
  },
  projects: [
    { name: 'normal', testIgnore: '**/known-issues.spec.js' },
    { name: 'known-issues', testMatch: '**/known-issues.spec.js' },
  ],
});
