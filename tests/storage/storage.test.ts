import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { LlmProvider, ModelProfile } from '@/llm/types';
import { exportSettings, importSettings } from '@/storage/import-export';
import {
  getSettings,
  replaceSettings,
  resolveProfile,
  updateSettings,
  watchSettings,
} from '@/storage/index';
import { type AppSettings, DEFAULT_SETTINGS } from '@/storage/schema';

const provider = (id: string, over: Partial<LlmProvider> = {}): LlmProvider => ({
  id,
  name: id,
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: `sk-${id}`,
  ...over,
});

const model = (id: string, providerId: string, over: Partial<ModelProfile> = {}): ModelProfile => ({
  id,
  name: id,
  providerId,
  model: 'gpt-4o-mini',
  ...over,
});

/** One provider with N models on it, the shape this refactor exists to make cheap. */
function settings(modelIds: string[], defaults: AppSettings['defaults']): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    providers: [provider('p1')],
    models: modelIds.map((id) => model(id, 'p1')),
    defaults,
  };
}

/** A payload written by v0.3.0 or earlier: flat profiles, no `models` array. */
const v1Payload = {
  version: 1,
  providers: [
    {
      id: 'old-a',
      name: 'Legacy',
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-legacy',
      model: 'gpt-4o-mini',
    },
  ],
  defaults: { global: 'old-a' },
  general: { targetLang: 'zh-CN', selectionTrigger: 'icon', pageMode: 'bilingual', uiLang: 'auto' },
  siteRules: { autoTranslate: [], disableSelection: [] },
  prompts: {},
};

describe('settings read/write', () => {
  beforeEach(() => fakeBrowser.reset());

  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists a partial update', async () => {
    await updateSettings({ providers: [provider('a')] });
    const s = await getSettings();
    expect(s.providers).toHaveLength(1);
    expect(s.general.targetLang).toBe('zh-CN'); // untouched
  });

  it('notifies watchers on change', async () => {
    const seen: number[] = [];
    const unwatch = watchSettings((s) => seen.push(s.providers.length));
    await updateSettings({ providers: [provider('a'), provider('b')] });
    expect(seen.at(-1)).toBe(2);
    unwatch();
  });
});

describe('stored v1 payloads', () => {
  beforeEach(() => fakeBrowser.reset());

  it('migrates on read and writes the v2 result back once', async () => {
    await fakeBrowser.storage.local.set({ settings: v1Payload });

    const first = await getSettings();
    expect(first.version).toBe(2);
    expect(first.providers).toHaveLength(1);
    expect(first.models).toHaveLength(1);

    const stored = (await fakeBrowser.storage.local.get('settings')).settings as AppSettings;
    expect(stored.version).toBe(2);
  });

  it('resolves a feature through the migrated payload', async () => {
    await fakeBrowser.storage.local.set({ settings: v1Payload });
    const resolved = await resolveProfile('selection');
    expect(resolved?.model).toBe('gpt-4o-mini');
    expect(resolved?.apiKey).toBe('sk-legacy');
  });

  it('keeps a partial update from resurrecting the v1 shape', async () => {
    await fakeBrowser.storage.local.set({ settings: v1Payload });
    await updateSettings({ general: { ...DEFAULT_SETTINGS.general, targetLang: 'ja' } });
    const s = await getSettings();
    expect(s.version).toBe(2);
    expect(s.models).toHaveLength(1);
    expect(s.general.targetLang).toBe('ja');
  });
});

describe('resolveProfile', () => {
  beforeEach(() => fakeBrowser.reset());

  it('returns null when no default is set', async () => {
    expect(await resolveProfile('selection')).toBeNull();
  });

  it('falls back to the global default when no feature override', async () => {
    await replaceSettings(settings(['g'], { global: 'g' }));
    expect((await resolveProfile('page'))?.id).toBe('g');
  });

  it('prefers a feature override over the global default', async () => {
    await replaceSettings(settings(['g', 's'], { global: 'g', selection: 's' }));
    expect((await resolveProfile('selection'))?.id).toBe('s');
    expect((await resolveProfile('page'))?.id).toBe('g');
  });

  it('falls back to global when the override points to a deleted model', async () => {
    await replaceSettings(settings(['g'], { global: 'g', selection: 'missing' }));
    expect((await resolveProfile('selection'))?.id).toBe('g');
  });

  it('shares one provider across several models', async () => {
    await replaceSettings(settings(['g', 's'], { global: 'g', selection: 's' }));
    const a = await resolveProfile('page');
    const b = await resolveProfile('selection');
    expect(a?.apiKey).toBe('sk-p1');
    expect(b?.apiKey).toBe('sk-p1');
  });
});

describe('import/export', () => {
  beforeEach(() => fakeBrowser.reset());

  const withImageOverride: AppSettings = settings(['m1', 'm2'], { global: 'm1', image: 'm2' });

  it('excludes API keys by default and includes them when asked', () => {
    const s = settings(['m1'], { global: 'm1' });
    expect(JSON.parse(exportSettings(s, false)).providers[0].apiKey).toBe('');
    expect(JSON.parse(exportSettings(s, true)).providers[0].apiKey).toBe('sk-p1');
  });

  it('strips api keys from providers but leaves models alone', () => {
    const json = JSON.parse(exportSettings(withImageOverride, false));
    expect(json.providers.every((p: { apiKey: string }) => p.apiKey === '')).toBe(true);
    expect(json.models[0].model).toBe('gpt-4o-mini');
  });

  it('round-trips through export then import', async () => {
    await importSettings(exportSettings(settings(['m1'], { global: 'm1' }), true));
    const restored = await getSettings();
    expect(restored.providers[0]?.apiKey).toBe('sk-p1');
    expect(restored.models[0]?.id).toBe('m1');
    expect(restored.defaults.global).toBe('m1');
  });

  it('keeps the image feature override through a round-trip', async () => {
    await importSettings(exportSettings(withImageOverride, true));
    expect((await getSettings()).defaults.image).toBe('m2');
  });

  it('re-imports a key-stripped export', async () => {
    await importSettings(exportSettings(withImageOverride, false));
    expect((await getSettings()).providers[0]?.apiKey).toBe('');
  });

  it('keeps custom prompt overrides on import, including imageText', async () => {
    const s: AppSettings = {
      ...settings(['m1'], { global: 'm1' }),
      prompts: { selectionText: 'custom sel', imageText: 'custom img' },
    };
    await importSettings(exportSettings(s, true));
    expect((await getSettings()).prompts).toEqual({
      selectionText: 'custom sel',
      imageText: 'custom img',
    });
  });

  it('keeps the selection search toggle, its model override and its prompt through a round-trip', async () => {
    const base = settings(['m1', 'm2'], { global: 'm1', search: 'm2' });
    const s: AppSettings = {
      ...base,
      general: { ...base.general, selectionSearch: true },
      prompts: { selectionSearch: 'custom search' },
    };
    await importSettings(exportSettings(s, true));
    const restored = await getSettings();
    expect(restored.general.selectionSearch).toBe(true);
    expect(restored.defaults.search).toBe('m2');
    expect(restored.prompts).toEqual({ selectionSearch: 'custom search' });
  });

  it('drops a selection search toggle that is not a boolean', async () => {
    const base = settings(['m1'], { global: 'm1' });
    const bad = { ...base, general: { ...base.general, selectionSearch: 'yes' } };
    await importSettings(JSON.stringify(bad));
    expect((await getSettings()).general.selectionSearch).toBeUndefined();
  });

  it('imports records whose name is empty (name is an optional label)', async () => {
    const s: AppSettings = {
      ...DEFAULT_SETTINGS,
      providers: [provider('p1', { name: '' })],
      models: [model('m1', 'p1', { name: '' })],
      defaults: { global: 'm1' },
    };
    await importSettings(exportSettings(s, true));
    const restored = await getSettings();
    expect(restored.providers[0]?.name).toBe('');
    expect(restored.models[0]?.name).toBe('');
  });

  it('imports a v1 file exported by an older build', async () => {
    await importSettings(JSON.stringify(v1Payload));
    const s = await getSettings();
    expect(s.version).toBe(2);
    expect(s.providers).toHaveLength(1);
    expect(s.models[0]?.model).toBe('gpt-4o-mini');
    expect(s.defaults.global).toBe('old-a');
  });

  it('rejects a model that references a provider not in the file', async () => {
    const broken = {
      ...withImageOverride,
      models: [{ ...withImageOverride.models[0], providerId: 'ghost' }],
    };
    await expect(importSettings(JSON.stringify(broken))).rejects.toThrow(/provider/i);
  });

  it('drops a default pointing at a model that is not in the file', async () => {
    const broken = { ...withImageOverride, defaults: { global: 'm1', image: 'ghost' } };
    await importSettings(JSON.stringify(broken));
    expect((await getSettings()).defaults.image).toBeUndefined();
  });

  it('throws on invalid JSON', async () => {
    await expect(importSettings('{not json')).rejects.toThrow();
  });

  it('throws when a provider has an invalid protocol', async () => {
    const bad = JSON.stringify({
      ...withImageOverride,
      providers: [{ ...withImageOverride.providers[0], protocol: 'gemini' }],
    });
    await expect(importSettings(bad)).rejects.toThrow();
  });
});
