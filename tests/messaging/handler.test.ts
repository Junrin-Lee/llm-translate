import { describe, expect, it, vi } from 'vitest';
import { LlmError, type ProviderProfile, type TranslationClient } from '@/llm/types';
import { handleRequest } from '@/messaging/handler';
import type { BgEvent, BgRequest } from '@/messaging/protocol';
import { type AppSettings, DEFAULT_SETTINGS } from '@/storage/schema';
import type { TranslationCache } from '@/translator/cache';

const profile: ProviderProfile = {
  id: 'p1',
  name: 'p1',
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk',
  model: 'gpt-4o-mini',
};

function settingsWith(providers: ProviderProfile[]): AppSettings {
  return { ...DEFAULT_SETTINGS, providers, defaults: { global: providers[0]?.id ?? null } };
}

/** Build a fake TranslationClient with overridable behavior. */
function fakeClient(overrides: Partial<TranslationClient>): TranslationClient {
  return {
    stream: async () => ({ text: '' }),
    complete: async () => ({ text: '' }),
    listModels: async () => [],
    testConnection: async () => ({ ok: true }),
    ...overrides,
  };
}

function collector() {
  const events: BgEvent[] = [];
  return { emit: (e: BgEvent) => events.push(e), events };
}

describe('handleRequest translate-stream', () => {
  it('renders the prompt, streams deltas and finishes with done', async () => {
    const client = fakeClient({
      stream: async (_req, onDelta) => {
        onDelta('Bon');
        onDelta('jour');
        return { text: 'Bonjour', usage: { inputTokens: 5, outputTokens: 2 } };
      },
    });
    const { emit, events } = collector();
    const req: BgRequest = {
      kind: 'translate-stream',
      feature: 'selection',
      promptKind: 'selectionText',
      vars: { text: 'hello', targetLang: 'zh-CN' },
    };
    await handleRequest(req, emit, {
      getSettings: async () => settingsWith([profile]),
      resolveProfile: async () => profile,
      createClient: () => client,
    });

    expect(events).toEqual([
      { type: 'delta', text: 'Bon' },
      { type: 'delta', text: 'jour' },
      { type: 'done', usage: { inputTokens: 5, outputTokens: 2 } },
    ]);
  });

  it('emits not_found when no provider resolves', async () => {
    const { emit, events } = collector();
    await handleRequest(
      {
        kind: 'translate-stream',
        feature: 'selection',
        promptKind: 'selectionText',
        vars: { text: 'x', targetLang: 'en' },
      },
      emit,
      {
        getSettings: async () => DEFAULT_SETTINGS,
        resolveProfile: async () => null,
        createClient: () => fakeClient({}),
      },
    );
    expect(events).toEqual([{ type: 'error', code: 'not_found', message: expect.any(String) }]);
  });

  it('maps a thrown LlmError to an error event', async () => {
    const client = fakeClient({
      stream: async () => {
        throw new LlmError('auth', 'bad key', { status: 401 });
      },
    });
    const { emit, events } = collector();
    await handleRequest(
      {
        kind: 'translate-stream',
        feature: 'selection',
        promptKind: 'selectionText',
        vars: { text: 'x', targetLang: 'en' },
      },
      emit,
      {
        getSettings: async () => settingsWith([profile]),
        resolveProfile: async () => profile,
        createClient: () => client,
      },
    );
    expect(events).toEqual([{ type: 'error', code: 'auth', message: 'bad key' }]);
  });

  it('passes prompt overrides from settings into the rendered prompt', async () => {
    const streamSpy = vi.fn(async () => ({ text: 'x' }));
    const client = fakeClient({ stream: streamSpy as unknown as TranslationClient['stream'] });
    const settings: AppSettings = {
      ...settingsWith([profile]),
      prompts: { selectionText: 'CUSTOM {{targetLang}}' },
    };
    await handleRequest(
      {
        kind: 'translate-stream',
        feature: 'selection',
        promptKind: 'selectionText',
        vars: { text: 'hi', targetLang: 'ja' },
      },
      () => {},
      {
        getSettings: async () => settings,
        resolveProfile: async () => profile,
        createClient: () => client,
      },
    );
    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'CUSTOM ja', user: 'hi', model: 'gpt-4o-mini' }),
      expect.any(Function),
      undefined,
    );
  });
});

describe('handleRequest list-models & test-connection', () => {
  it('returns models for a known profile', async () => {
    const client = fakeClient({ listModels: async () => ['a', 'b'] });
    const { emit, events } = collector();
    await handleRequest({ kind: 'list-models', profileId: 'p1' }, emit, {
      getSettings: async () => settingsWith([profile]),
      resolveProfile: async () => null,
      createClient: () => client,
    });
    expect(events).toEqual([{ type: 'models', models: ['a', 'b'] }]);
  });

  it('emits not_found for an unknown profile id', async () => {
    const { emit, events } = collector();
    await handleRequest({ kind: 'test-connection', profileId: 'ghost' }, emit, {
      getSettings: async () => settingsWith([profile]),
      resolveProfile: async () => null,
      createClient: () => fakeClient({}),
    });
    expect(events[0]).toMatchObject({ type: 'error', code: 'not_found' });
  });

  it('reports a connection test result', async () => {
    const client = fakeClient({ testConnection: async () => ({ ok: true, latencyMs: 42 }) });
    const { emit, events } = collector();
    await handleRequest({ kind: 'test-connection', profileId: 'p1' }, emit, {
      getSettings: async () => settingsWith([profile]),
      resolveProfile: async () => null,
      createClient: () => client,
    });
    expect(events).toEqual([
      { type: 'test-result', ok: true, latencyMs: 42, errorCode: undefined, message: undefined },
    ]);
  });
});

describe('handleRequest translate-batch', () => {
  it('renders the page-batch prompt on the payload and returns the raw completion', async () => {
    const completeSpy = vi.fn(async () => ({ text: '@@0@@\n译文' }));
    const client = fakeClient({
      complete: completeSpy as unknown as TranslationClient['complete'],
    });
    const { emit, events } = collector();
    await handleRequest(
      {
        kind: 'translate-batch',
        feature: 'page',
        payload: '@@0@@\nHello',
        vars: { targetLang: 'zh-CN' },
      },
      emit,
      {
        getSettings: async () => settingsWith([profile]),
        resolveProfile: async () => profile,
        createClient: () => client,
      },
    );
    expect(events).toEqual([{ type: 'batch-result', text: '@@0@@\n译文' }]);
    expect(completeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user: '@@0@@\nHello', model: 'gpt-4o-mini' }),
      undefined,
    );
  });
});

function fakeCache(): TranslationCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k) => store.get(k),
    set: async (k, v) => {
      store.set(k, v);
    },
  };
}

describe('handleRequest caching', () => {
  const streamReq: BgRequest = {
    kind: 'translate-stream',
    feature: 'selection',
    promptKind: 'selectionText',
    vars: { text: 'hi', targetLang: 'zh-CN' },
  };

  it('caches a selection result and serves it without calling the model again', async () => {
    const streamSpy = vi.fn(async (_r: unknown, onDelta: (t: string) => void) => {
      onDelta('你好');
      return { text: '你好' };
    });
    const client = fakeClient({ stream: streamSpy as unknown as TranslationClient['stream'] });
    const deps = {
      getSettings: async () => settingsWith([profile]),
      resolveProfile: async () => profile,
      createClient: () => client,
      selectionCache: fakeCache(),
    };

    const first = collector();
    await handleRequest(streamReq, first.emit, deps);
    const second = collector();
    await handleRequest(streamReq, second.emit, deps);

    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(second.events).toEqual([{ type: 'delta', text: '你好' }, { type: 'done' }]);
  });

  it('bypasses the cache when bypassCache is set', async () => {
    const streamSpy = vi.fn(async (_r: unknown, onDelta: (t: string) => void) => {
      onDelta('你好');
      return { text: '你好' };
    });
    const client = fakeClient({ stream: streamSpy as unknown as TranslationClient['stream'] });
    const deps = {
      getSettings: async () => settingsWith([profile]),
      resolveProfile: async () => profile,
      createClient: () => client,
      selectionCache: fakeCache(),
    };

    await handleRequest(streamReq, collector().emit, deps);
    await handleRequest({ ...streamReq, bypassCache: true }, collector().emit, deps);

    expect(streamSpy).toHaveBeenCalledTimes(2);
  });
});
