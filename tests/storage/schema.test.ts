import { describe, expect, it } from 'vitest';
import type { ProviderProfile } from '@/llm/types';
import { type AppSettings, DEFAULT_SETTINGS, resolveProfileFrom } from '@/storage/schema';

const p = (id: string): ProviderProfile => ({
  id,
  name: id,
  protocol: 'openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk',
  model: 'gpt-4o-mini',
});

function settings(overrides: Partial<AppSettings['defaults']>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    providers: [p('g'), p('i')],
    defaults: { global: 'g', ...overrides },
  };
}

describe('resolveProfileFrom', () => {
  it('prefers the image feature override over the global default', () => {
    expect(resolveProfileFrom(settings({ image: 'i' }), 'image')?.id).toBe('i');
  });

  it('falls back to the global default when the feature has no override', () => {
    expect(resolveProfileFrom(settings({}), 'image')?.id).toBe('g');
  });

  it('skips an override id that no longer exists', () => {
    expect(resolveProfileFrom(settings({ image: 'gone' }), 'image')?.id).toBe('g');
  });

  it('returns null when nothing resolves', () => {
    expect(resolveProfileFrom(DEFAULT_SETTINGS, 'selection')).toBeNull();
  });
});
