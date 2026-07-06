import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ProviderProfile } from '@/llm/types';
import { exportSettings, importSettings } from '@/storage/import-export';
import { getSettings, resolveProfile, updateSettings, watchSettings } from '@/storage/index';
import { DEFAULT_SETTINGS } from '@/storage/schema';

const p = (id: string): ProviderProfile => ({
  id,
  name: id,
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: `sk-${id}`,
  model: 'gpt-4o-mini',
});

describe('settings read/write', () => {
  beforeEach(() => fakeBrowser.reset());

  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists a partial update', async () => {
    await updateSettings({ providers: [p('a')] });
    const s = await getSettings();
    expect(s.providers).toHaveLength(1);
    expect(s.general.targetLang).toBe('zh-CN'); // untouched
  });

  it('notifies watchers on change', async () => {
    const seen: number[] = [];
    const unwatch = watchSettings((s) => seen.push(s.providers.length));
    await updateSettings({ providers: [p('a'), p('b')] });
    expect(seen.at(-1)).toBe(2);
    unwatch();
  });
});

describe('resolveProfile', () => {
  beforeEach(() => fakeBrowser.reset());

  it('returns null when no default is set', async () => {
    expect(await resolveProfile('selection')).toBeNull();
  });

  it('falls back to the global default when no feature override', async () => {
    await updateSettings({ providers: [p('g')], defaults: { global: 'g' } });
    expect((await resolveProfile('page'))?.id).toBe('g');
  });

  it('prefers a feature override over the global default', async () => {
    await updateSettings({
      providers: [p('g'), p('s')],
      defaults: { global: 'g', selection: 's' },
    });
    expect((await resolveProfile('selection'))?.id).toBe('s');
    expect((await resolveProfile('page'))?.id).toBe('g');
  });

  it('falls back to global when the override points to a deleted profile', async () => {
    await updateSettings({
      providers: [p('g')],
      defaults: { global: 'g', selection: 'missing' },
    });
    expect((await resolveProfile('selection'))?.id).toBe('g');
  });
});

describe('import/export', () => {
  beforeEach(() => fakeBrowser.reset());

  it('excludes API keys by default and includes them when asked', async () => {
    const settings = { ...DEFAULT_SETTINGS, providers: [p('a')] };
    expect(JSON.parse(exportSettings(settings, false)).providers[0].apiKey).toBe('');
    expect(JSON.parse(exportSettings(settings, true)).providers[0].apiKey).toBe('sk-a');
  });

  it('round-trips through export then import', async () => {
    const settings = { ...DEFAULT_SETTINGS, providers: [p('a')], defaults: { global: 'a' } };
    await importSettings(exportSettings(settings, true));
    const restored = await getSettings();
    expect(restored.providers[0]?.apiKey).toBe('sk-a');
    expect(restored.defaults.global).toBe('a');
  });

  it('throws on invalid JSON', async () => {
    await expect(importSettings('{not json')).rejects.toThrow();
  });

  it('throws when a provider has an invalid protocol', async () => {
    const bad = JSON.stringify({
      ...DEFAULT_SETTINGS,
      providers: [{ ...p('a'), protocol: 'gemini' }],
    });
    await expect(importSettings(bad)).rejects.toThrow();
  });
});
