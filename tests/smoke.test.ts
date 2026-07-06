import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BRAND } from '@/brand';

// Smoke test proving the vitest + WXT harness is wired: the `@/` alias
// resolves to src/, and the in-memory browser.storage polyfill works.
describe('test harness smoke', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('resolves the @/ alias and exposes the product brand name', () => {
    expect(BRAND.name.length).toBeGreaterThan(0);
  });

  it('provides an in-memory browser.storage.local', async () => {
    await fakeBrowser.storage.local.set({ hello: 'world' });
    const result = await fakeBrowser.storage.local.get('hello');
    expect(result).toEqual({ hello: 'world' });
  });
});
