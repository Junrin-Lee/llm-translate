import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// WxtVitest polyfills the extension API (in-memory fakeBrowser), applies the
// Vite config from wxt.config.ts, wires auto-imports and resolves the `@/` alias.
export default defineConfig({
  plugins: [WxtVitest()],
  // Unit tests live under tests/; e2e/*.spec.ts is Playwright's, run separately.
  test: { include: ['tests/**/*.test.ts'] },
});
