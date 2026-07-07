import { defineConfig } from '@playwright/test';

/**
 * E2E runs against a real Chromium with the built extension loaded (see
 * e2e/support.ts). A local mock LLM server (e2e/mock-llm.mjs) stands in for the
 * provider endpoint and also serves the test fixtures, so no network is needed.
 */
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 8787);

export default defineConfig({
  testDir: './e2e',
  // Each test launches its own persistent browser context; keep them serial so
  // they don't contend for the shared mock server or the display.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  webServer: {
    command: 'node e2e/mock-llm.mjs',
    port: MOCK_PORT,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
