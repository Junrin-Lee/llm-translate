import { beforeEach, describe, expect, it } from 'vitest';
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

  it('keeps entries isolated by storageKey', async () => {
    const selection = createCache(area(), { storageKey: 'cache:selection' });
    const page = createCache(area(), { storageKey: 'cache:page' });
    await selection.set('k', 'sel');
    await page.set('k', 'page');
    expect(await selection.get('k')).toBe('sel');
    expect(await page.get('k')).toBe('page');
  });
});
