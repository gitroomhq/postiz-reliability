import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  tsconfig: './tsconfig.json',
  outputDir: './test-results',

  // One post at a time against one real org, and a retry would publish a
  // second real post: confirmation re-runs are done by the runner instead.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,

  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },

  use: {
    trace: 'retain-on-failure',
    actionTimeout: 60_000,
    ignoreHTTPSErrors: false,
  },

  projects: [{ name: 'gate' }],

  reporter: [['list']],
});
