import { describe, expect, it } from 'vitest';
import { renderPrompt } from '@/prompts/index';

describe('renderPrompt defaults', () => {
  it('interpolates targetLang into the selection-text system prompt and passes text as user', () => {
    const { system, user, version } = renderPrompt('selectionText', {
      text: 'hello world',
      targetLang: 'zh-CN',
    });
    expect(system).toContain('zh-CN');
    expect(user).toBe('hello world');
    expect(version).toBe('v1');
  });

  it('produces a JSON-oriented dictionary prompt', () => {
    const { system } = renderPrompt('selectionDict', { text: 'run', targetLang: 'zh-CN' });
    expect(system.toLowerCase()).toContain('json');
    expect(system).toContain('zh-CN');
  });

  it('instructs the page-batch prompt to preserve markers', () => {
    const { system } = renderPrompt('pageBatch', { text: '@@0@@ Hi', targetLang: 'ja' });
    expect(system).toContain('@@');
    expect(system).toContain('ja');
  });
});

describe('renderPrompt interpolation', () => {
  it('replaces a missing optional variable with an empty string', () => {
    const { system } = renderPrompt(
      'selectionText',
      { text: 't', targetLang: 'en' },
      { selectionText: 'from {{sourceLang}} to {{targetLang}}' },
    );
    expect(system).toBe('from  to en');
  });

  it('leaves unknown placeholders untouched', () => {
    const { system } = renderPrompt(
      'selectionText',
      { text: 't', targetLang: 'en' },
      { selectionText: 'keep {{brand}} literal' },
    );
    expect(system).toBe('keep {{brand}} literal');
  });
});

describe('renderPrompt overrides & versioning', () => {
  it('uses the override as the system prompt and marks a custom version', () => {
    const { system, version } = renderPrompt(
      'selectionText',
      { text: 't', targetLang: 'zh-CN' },
      { selectionText: 'Custom {{targetLang}} please' },
    );
    expect(system).toBe('Custom zh-CN please');
    expect(version.startsWith('custom:')).toBe(true);
  });

  it('yields the same version for the same override and a different one otherwise', () => {
    const v1 = renderPrompt(
      'selectionText',
      { text: 't', targetLang: 'en' },
      { selectionText: 'A' },
    ).version;
    const v1again = renderPrompt(
      'selectionText',
      { text: 't', targetLang: 'en' },
      { selectionText: 'A' },
    ).version;
    const v2 = renderPrompt(
      'selectionText',
      { text: 't', targetLang: 'en' },
      { selectionText: 'B' },
    ).version;
    expect(v1).toBe(v1again);
    expect(v1).not.toBe(v2);
  });
});

describe('renderPrompt imageText', () => {
  it('interpolates targetLang into both system and user templates', () => {
    const rendered = renderPrompt('imageText', { text: '', targetLang: 'zh-CN' });
    expect(rendered.system).toContain('zh-CN');
    expect(rendered.user).toContain('zh-CN');
    expect(rendered.version).toBe('v1');
  });
});
