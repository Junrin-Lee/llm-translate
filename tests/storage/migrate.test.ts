import { describe, expect, it } from 'vitest';
import { migrateSettings } from '@/storage/migrate';
import { DEFAULT_SETTINGS } from '@/storage/schema';

const v1 = {
  version: 1,
  providers: [
    {
      id: 'old-a',
      name: 'Gateway / fast',
      protocol: 'openai',
      baseUrl: 'https://gw.example.com/v1',
      apiKey: 'sk-1',
      model: 'gpt-4o-mini',
      params: { temperature: 0.2, timeoutMs: 30_000 },
    },
    {
      id: 'old-b',
      name: 'Gateway / strong',
      protocol: 'openai',
      baseUrl: 'https://gw.example.com/v1',
      apiKey: 'sk-1',
      model: 'gpt-4o',
    },
  ],
  defaults: { global: 'old-a', image: 'old-b' },
  general: { targetLang: 'ja', selectionTrigger: 'instant', pageMode: 'replace', uiLang: 'en' },
  siteRules: { autoTranslate: ['a.com'], disableSelection: [] },
  prompts: { pageBatch: 'custom' },
};

describe('migrateSettings', () => {
  it('splits every v1 profile 1:1 without deduping providers', () => {
    const next = migrateSettings(v1);
    expect(next.version).toBe(2);
    expect(next.providers).toHaveLength(2);
    expect(next.models).toHaveLength(2);
    expect(next.providers[0]).toMatchObject({
      protocol: 'openai',
      baseUrl: 'https://gw.example.com/v1',
      apiKey: 'sk-1',
    });
    expect(next.providers[0]).not.toHaveProperty('model');
  });

  it('keeps the old profile id on the model so defaults still resolve', () => {
    const next = migrateSettings(v1);
    expect(next.models.map((m) => m.id)).toEqual(['old-a', 'old-b']);
    expect(next.defaults).toEqual({ global: 'old-a', image: 'old-b' });
  });

  it('links each model to the provider built from the same profile', () => {
    const next = migrateSettings(v1);
    expect(next.models[0].providerId).toBe(next.providers[0].id);
    expect(next.models[1].providerId).toBe(next.providers[1].id);
    expect(next.models[0].providerId).not.toBe(next.models[1].providerId);
  });

  it('moves params onto the model', () => {
    expect(migrateSettings(v1).models[0].params).toEqual({ temperature: 0.2, timeoutMs: 30_000 });
    expect(migrateSettings(v1).models[1].params).toBeUndefined();
  });

  it('carries general, siteRules and prompts through untouched', () => {
    const next = migrateSettings(v1);
    expect(next.general.targetLang).toBe('ja');
    expect(next.siteRules.autoTranslate).toEqual(['a.com']);
    expect(next.prompts.pageBatch).toBe('custom');
  });

  it('returns v2 input by identity so callers can skip a write-back', () => {
    expect(migrateSettings(DEFAULT_SETTINGS)).toBe(DEFAULT_SETTINGS);
  });

  it('is idempotent', () => {
    const once = migrateSettings(v1);
    expect(migrateSettings(once)).toBe(once);
  });

  it('falls back to defaults for junk input', () => {
    expect(migrateSettings(null)).toBe(DEFAULT_SETTINGS);
    expect(migrateSettings('nope')).toBe(DEFAULT_SETTINGS);
  });

  it('treats a versionless object as v1', () => {
    expect(migrateSettings({ providers: [v1.providers[0]] }).version).toBe(2);
  });

  it('skips profiles with no usable id', () => {
    expect(migrateSettings({ version: 1, providers: [{ baseUrl: 'x' }] }).models).toHaveLength(0);
  });

  it('preserves an anthropic protocol and defaults anything unknown to openai', () => {
    const mixed = {
      version: 1,
      providers: [
        { id: 'a', protocol: 'anthropic', baseUrl: 'https://x', model: 'claude' },
        { id: 'b', protocol: 'gemini', baseUrl: 'https://y', model: 'g' },
      ],
    };
    expect(migrateSettings(mixed).providers.map((p) => p.protocol)).toEqual([
      'anthropic',
      'openai',
    ]);
  });
});
