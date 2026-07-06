import { describe, expect, it } from 'vitest';
import { endpointFor, normalizeBaseUrl } from '@/llm/base-url';

describe('normalizeBaseUrl (openai)', () => {
  it('appends /v1 when the URL has no path', () => {
    expect(normalizeBaseUrl('https://api.openai.com', 'openai')).toBe('https://api.openai.com/v1');
  });

  it('leaves an existing /v1 path untouched', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1', 'openai')).toBe(
      'https://api.openai.com/v1',
    );
  });

  it('strips trailing slashes', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1/', 'openai')).toBe(
      'https://api.openai.com/v1',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeBaseUrl('  https://api.openai.com  ', 'openai')).toBe(
      'https://api.openai.com/v1',
    );
  });

  it('does not touch a custom gateway path', () => {
    expect(normalizeBaseUrl('https://gw.corp.com/openai', 'openai')).toBe(
      'https://gw.corp.com/openai',
    );
  });

  it('leaves a local Ollama base with /v1 as-is', () => {
    expect(normalizeBaseUrl('http://localhost:11434/v1', 'openai')).toBe(
      'http://localhost:11434/v1',
    );
  });
});

describe('normalizeBaseUrl (anthropic)', () => {
  it('trims but does not add /v1 (endpointFor owns that)', () => {
    expect(normalizeBaseUrl('https://api.anthropic.com/', 'anthropic')).toBe(
      'https://api.anthropic.com',
    );
  });
});

describe('normalizeBaseUrl (invalid input)', () => {
  it('returns trimmed input when it is not a URL', () => {
    expect(normalizeBaseUrl('  not a url  ', 'openai')).toBe('not a url');
  });
});

describe('endpointFor (openai)', () => {
  it('builds the chat endpoint', () => {
    expect(endpointFor('https://api.openai.com/v1', 'openai', 'chat')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });

  it('builds the models endpoint', () => {
    expect(endpointFor('https://api.openai.com/v1', 'openai', 'models')).toBe(
      'https://api.openai.com/v1/models',
    );
  });

  it('tolerates a trailing slash on the base', () => {
    expect(endpointFor('https://api.openai.com/v1/', 'openai', 'chat')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });
});

describe('endpointFor (anthropic)', () => {
  it('adds /v1 when the base lacks it', () => {
    expect(endpointFor('https://api.anthropic.com', 'anthropic', 'chat')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
  });

  it('does not duplicate an existing /v1', () => {
    expect(endpointFor('https://api.anthropic.com/v1', 'anthropic', 'chat')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
  });

  it('builds the models endpoint', () => {
    expect(endpointFor('https://api.anthropic.com', 'anthropic', 'models')).toBe(
      'https://api.anthropic.com/v1/models',
    );
  });
});

describe('normalize + endpointFor together', () => {
  it('handles a DeepSeek base entered without /v1', () => {
    const base = normalizeBaseUrl('https://api.deepseek.com', 'openai');
    expect(endpointFor(base, 'openai', 'chat')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    );
  });
});
