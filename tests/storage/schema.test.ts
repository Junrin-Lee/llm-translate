import { describe, expect, it } from 'vitest';
import type { LlmProvider, ModelProfile } from '@/llm/types';
import {
  type AppSettings,
  countMergeableProviders,
  DEFAULT_SETTINGS,
  joinProfile,
  mergeDuplicateProviders,
  pruneDefaults,
  resolveProfileFrom,
} from '@/storage/schema';

const provider = (id: string, over: Partial<LlmProvider> = {}): LlmProvider => ({
  id,
  name: id,
  protocol: 'openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk',
  ...over,
});

const model = (id: string, providerId: string, over: Partial<ModelProfile> = {}): ModelProfile => ({
  id,
  name: id,
  providerId,
  model: 'gpt-4o-mini',
  ...over,
});

function settings(over: Partial<AppSettings> = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    providers: [provider('p1')],
    models: [model('g', 'p1'), model('i', 'p1')],
    defaults: { global: 'g' },
    ...over,
  };
}

describe('resolveProfileFrom', () => {
  it('joins the model with its provider', () => {
    expect(resolveProfileFrom(settings(), 'selection')).toMatchObject({
      id: 'g',
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk',
      model: 'gpt-4o-mini',
    });
  });

  it('prefers the image feature override over the global default', () => {
    const s = settings({ defaults: { global: 'g', image: 'i' } });
    expect(resolveProfileFrom(s, 'image')?.id).toBe('i');
  });

  it('falls back to the global default when the feature has no override', () => {
    expect(resolveProfileFrom(settings(), 'image')?.id).toBe('g');
  });

  it('skips an override id that no longer exists', () => {
    const s = settings({ defaults: { global: 'g', image: 'gone' } });
    expect(resolveProfileFrom(s, 'image')?.id).toBe('g');
  });

  it('skips a model whose provider is missing and falls back to global', () => {
    const s = settings({
      models: [model('g', 'p1'), model('orphan', 'nope')],
      defaults: { global: 'g', image: 'orphan' },
    });
    expect(resolveProfileFrom(s, 'image')?.id).toBe('g');
  });

  it('returns null when nothing resolves', () => {
    expect(resolveProfileFrom(DEFAULT_SETTINGS, 'selection')).toBeNull();
  });

  it('prefers the search feature override', () => {
    const s = settings({
      models: [model('g', 'p1'), model('sel', 'p1'), model('srch', 'p1')],
      defaults: { global: 'g', selection: 'sel', search: 'srch' },
    });
    expect(resolveProfileFrom(s, 'search')?.id).toBe('srch');
  });

  it('falls back from search to the selection override before the global default', () => {
    const s = settings({
      models: [model('g', 'p1'), model('sel', 'p1')],
      defaults: { global: 'g', selection: 'sel' },
    });
    expect(resolveProfileFrom(s, 'search')?.id).toBe('sel');
  });

  it('falls back from search to the global default when selection has no override', () => {
    expect(resolveProfileFrom(settings(), 'search')?.id).toBe('g');
  });

  it('never routes other features through the selection override', () => {
    const s = settings({
      models: [model('g', 'p1'), model('sel', 'p1')],
      defaults: { global: 'g', selection: 'sel' },
    });
    expect(resolveProfileFrom(s, 'image')?.id).toBe('g');
  });
});

describe('joinProfile', () => {
  it('lets the model params win over the provider timeout', () => {
    const p = provider('p1', { timeoutMs: 60_000 });
    const m = model('m', 'p1', { params: { timeoutMs: 5_000, temperature: 0.3 } });
    expect(joinProfile(p, m).params).toEqual({ timeoutMs: 5_000, temperature: 0.3 });
  });

  it('falls back to the provider timeout when the model has none', () => {
    const p = provider('p1', { timeoutMs: 60_000 });
    expect(joinProfile(p, model('m', 'p1')).params).toEqual({ timeoutMs: 60_000 });
  });

  it('omits params entirely when neither side sets anything', () => {
    expect(joinProfile(provider('p1'), model('m', 'p1')).params).toBeUndefined();
  });
});

describe('pruneDefaults', () => {
  it('keeps every feature override that still points at a live model', () => {
    const models = [model('g', 'p1'), model('i', 'p1')];
    expect(pruneDefaults({ global: 'g', selection: 'i', page: 'i', image: 'i' }, models)).toEqual({
      global: 'g',
      selection: 'i',
      page: 'i',
      image: 'i',
    });
  });

  it('drops the image override when its model is gone', () => {
    expect(pruneDefaults({ global: 'g', image: 'gone' }, [model('g', 'p1')])).toEqual({
      global: 'g',
    });
  });

  it('nulls a global that no longer resolves', () => {
    expect(pruneDefaults({ global: 'gone' }, [model('g', 'p1')])).toEqual({ global: null });
  });
});

describe('provider merge', () => {
  const dupes = settings({
    providers: [provider('p1'), provider('p2'), provider('p3', { apiKey: 'other' })],
    models: [model('a', 'p1'), model('b', 'p2'), model('c', 'p3')],
  });

  it('counts how many provider rows would disappear', () => {
    expect(countMergeableProviders(dupes.providers)).toBe(1);
    expect(countMergeableProviders([provider('p1'), provider('p3', { apiKey: 'x' })])).toBe(0);
  });

  it('keeps the first of each identical group and repoints the models', () => {
    const next = mergeDuplicateProviders(dupes);
    expect(next.providers.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(next.models.map((m) => m.providerId)).toEqual(['p1', 'p1', 'p3']);
  });

  it('never merges across different api keys', () => {
    const s = settings({
      providers: [provider('p1'), provider('p2', { apiKey: 'other' })],
      models: [model('a', 'p1'), model('b', 'p2')],
    });
    expect(mergeDuplicateProviders(s)).toBe(s);
  });

  it('does merge two key-stripped providers', () => {
    const s = settings({
      providers: [provider('p1', { apiKey: '' }), provider('p2', { apiKey: '' })],
      models: [model('a', 'p1'), model('b', 'p2')],
    });
    expect(mergeDuplicateProviders(s).providers).toHaveLength(1);
  });

  it('returns the same object when there is nothing to merge', () => {
    const s = settings();
    expect(mergeDuplicateProviders(s)).toBe(s);
  });
});
