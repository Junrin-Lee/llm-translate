import { defineConfig } from 'vitest/config';

// Real-browser smoke suite for the Firefox build. Run via `pnpm e2e:firefox`
// (zips the extension first). Kept apart from unit tests: no WxtVitest here.
export default defineConfig({
  test: {
    include: ['e2e-firefox/**/*.spec.ts'],
    globalSetup: ['e2e-firefox/global-setup.ts'],
    testTimeout: 120_000,
    // Verified empirically: with no system Firefox, selenium-webdriver's
    // Selenium Manager downloads Firefox + geckodriver into ~/.cache/selenium
    // on first use, inside the beforeAll hook. A cold cache exceeded a
    // 120_000 hookTimeout in that run; a warm cache (subsequent runs) took a
    // few seconds. Bumped to give first-ever runs (e.g. a fresh CI cache)
    // headroom without slowing down already-warm runs.
    hookTimeout: 240_000,
    fileParallelism: false,
  },
});
