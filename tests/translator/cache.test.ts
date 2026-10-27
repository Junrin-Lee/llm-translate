import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { cacheKey, createCache } from '@/translator/cache';

const base = {
  protocol: 'openai',
  model: 'gpt-4o-mini',
  promptVersion: 'v1',
  targetLang: 'zh-CN',
  kind: 'selectionText',
  text: 'hello',
} as const;

describe('cacheKey', () => {
  it('is stable for identical inputs', () => {
    expect(cacheKey(base)).toBe(cacheKey({ ...base }));
  });

  it('changes when any component changes', () => {
    const k = cacheKey(base);
    expect(cacheKey({ ...base, text: 'world' })).not.toBe(k);
    expect(cacheKey({ ...base, targetLang: 'en' })).not.toBe(k);
    expect(cacheKey({ ...base, kind: 'selectionDict' })).not.toBe(k);
    expect(cacheKey({ ...base, model: 'other' })).not.toBe(k);
    expect(cacheKey({ ...base, promptVersion: 'custom:abc' })).not.toBe(k);
  });
});

describe('createCache', () => {
  beforeEach(() => fakeBrowser.reset());

  const area = () => fakeBrowser.storage.local;

  it('stores and retrieves a value', async () => {
    const cache = createCache(area(), { storageKey: 'cache:test' });
    await cache.set('k1', '你好');
    expect(await cache.get('k1')).toBe('你好');
  });

  it('returns undefined for a missing key', async () => {
    const cache = createCache(area(), { storageKey: 'cache:test' });
    expect(await cache.get('nope')).toBeUndefined();
  });

  it('evicts the oldest entries beyond maxEntries', async () => {
    const cache = createCache(area(), { storageKey: 'cache:test', maxEntries: 2 });
    await cache.set('a', '1');
    await cache.set('b', '2');
    await cache.set('c', '3');

    expect(await cache.get('a')).toBeUndefined(); // evicted
    expect(await cache.get('b')).toBe('2');
    expect(await cache.get('c')).toBe('3');
  });

  describe('with ttlMs', () => {
    const DAY = 24 * 60 * 60 * 1000;
    afterEach(() => vi.useRealTimers());

    it('serves an entry younger than the ttl', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
      const cache = createCache(area(), { storageKey: 'cache:test', ttlMs: 7 * DAY });
      await cache.set('k', 'v');
      vi.setSystemTime(new Date('2026-10-07T23:00:00Z'));
      expect(await cache.get('k')).toBe('v');
    });

    it('misses an entry older than the ttl', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
      const cache = createCache(area(), { storageKey: 'cache:test', ttlMs: 7 * DAY });
      await cache.set('k', 'v');
      vi.setSystemTime(new Date('2026-10-08T00:00:01Z'));
      expect(await cache.get('k')).toBeUndefined();
    });

    it('drops expired entries from storage on the next write', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
      const cache = createCache(area(), { storageKey: 'cache:test', ttlMs: 7 * DAY });
      await cache.set('old', 'private page text');
      vi.setSystemTime(new Date('2026-10-09T00:00:00Z'));
      await cache.set('new', 'v');

      const stored = await area().get('cache:test');
      expect(Object.keys(stored['cache:test'] as object)).toEqual(['new']);
    });
  });

  it('keeps entries isolated by storageKey', async () => {
    const selection = createCache(area(), { storageKey: 'cache:selection' });
    const page = createCache(area(), { storageKey: 'cache:page' });
    await selection.set('k', 'sel');
    await page.set('k', 'page');
    expect(await selection.get('k')).toBe('sel');
    expect(await page.get('k')).toBe('page');
  });
});
