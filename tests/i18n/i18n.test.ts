import { afterEach, describe, expect, it } from 'vitest';
import { resolveLocale, setUiLanguage, t } from '@/i18n';

afterEach(() => setUiLanguage('en'));

describe('resolveLocale', () => {
  it('returns the forced locale directly', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('zh')).toBe('zh');
  });

  it('resolves auto to a supported locale', () => {
    expect(['en', 'zh']).toContain(resolveLocale('auto'));
  });
});

describe('t', () => {
  it('translates in the active locale', () => {
    setUiLanguage('en');
    expect(t('actionShow')).toBe('Show');
    setUiLanguage('zh');
    expect(t('actionShow')).toBe('显示');
  });

  it('substitutes {placeholders}', () => {
    setUiLanguage('en');
    expect(t('cacheStats', { selection: 2, page: 5 })).toBe(
      'Selection: 2 entries · Page: 5 entries',
    );
  });

  it('leaves {{variable}} syntax untouched', () => {
    setUiLanguage('en');
    expect(t('promptVars')).toContain('{{text}}');
  });
});
