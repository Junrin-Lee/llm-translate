import { describe, expect, it, vi } from 'vitest';
import {
  LlmError,
  type LlmProvider,
  type ModelProfile,
  type ResolvedProfile,
  type TranslationClient,
} from '@/llm/types';
import { handleRequest } from '@/messaging/handler';
import type { BgEvent, BgRequest } from '@/messaging/protocol';
import { type AppSettings, DEFAULT_SETTINGS } from '@/storage/schema';
import type { TranslationCache } from '@/translator/cache';

const provider: LlmProvider = {
  id: 'p1',
  name: 'p1',
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk',
};

const modelProfile: ModelProfile = {
  id: 'm1',
  name: 'm1',
  providerId: 'p1',
  model: 'gpt-4o-mini',
};

/** What resolveProfile hands back once provider and model are joined. */
const profile: ResolvedProfile = { ...provider, ...modelProfile, id: modelProfile.id };

/** A model whose provider was deleted; resolution must refuse to half-build it. */
const orphan: ModelProfile = { id: 'orphan', name: 'orphan', providerId: 'gone', model: 'x' };

function settingsWith(models: ModelProfile[] = [modelProfile]): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    providers: [provider],
    models,
    defaults: { global: models[0]?.id ?? null },
  };
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
      getSettings: async () => settingsWith(),
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
        getSettings: async () => settingsWith(),
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
      ...settingsWith(),
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

describe('handleRequest list-models', () => {
  const run = async (req: BgRequest, client: TranslationClient) => {
    const { emit, events } = collector();
    await handleRequest(req, emit, {
      getSettings: async () => settingsWith(),
      resolveProfile: async () => null,
      createClient: () => client,
    });
    return events;
  };

  it('lists models for a provider without needing a model profile', async () => {
    const events = await run(
      { kind: 'list-models', providerId: 'p1' },
      fakeClient({ listModels: async () => ['a', 'b'] }),
    );
    expect(events).toEqual([{ type: 'models', models: ['a', 'b'] }]);
  });

  it('emits not_found for an unknown provider id', async () => {
    const events = await run({ kind: 'list-models', providerId: 'ghost' }, fakeClient({}));
    expect(events[0]).toMatchObject({ type: 'error', code: 'not_found' });
  });

  // A failure here is an operation failure: the user asked for a list and did not
  // get one, so it must not arrive as an empty list (ADR-0007).
  it('reports a listModels failure as an error event, not an empty list', async () => {
    const events = await run(
      { kind: 'list-models', providerId: 'p1' },
      fakeClient({
        listModels: async () => {
          throw new LlmError('auth', 'Invalid API key');
        },
      }),
    );
    expect(events[0]).toMatchObject({ type: 'error', code: 'auth' });
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'models' }));
  });
});

describe('handleRequest test-provider & test-model', () => {
  function spyClient(overrides: Partial<TranslationClient> = {}) {
    const seen: ResolvedProfile[] = [];
    const listModels = vi.fn(async () => ['a']);
    const testConnection = vi.fn(async () => ({ ok: true, latencyMs: 42 }));
    const client = fakeClient({ listModels, testConnection, ...overrides });
    return {
      seen,
      listModels,
      testConnection,
      deps: {
        getSettings: async () => settingsWith([modelProfile, orphan]),
        resolveProfile: async () => null,
        createClient: (p: ResolvedProfile) => {
          seen.push(p);
          return client;
        },
      },
    };
  }

  it('probes a provider through listModels, never through a completion', async () => {
    const spy = spyClient();
    const { emit, events } = collector();
    await handleRequest({ kind: 'test-provider', providerId: 'p1' }, emit, spy.deps);
    expect(spy.listModels).toHaveBeenCalled();
    expect(spy.testConnection).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ type: 'test-result', ok: true });
    expect(spy.seen[0]).toMatchObject({ apiKey: 'sk', model: '' });
  });

  // The same LlmError is a verdict here, not an operation failure (ADR-0007).
  it('turns a provider probe failure into a test-result, not an error event', async () => {
    const spy = spyClient({
      listModels: async () => {
        throw new LlmError('auth', 'Invalid API key');
      },
    });
    const { emit, events } = collector();
    await handleRequest({ kind: 'test-provider', providerId: 'p1' }, emit, spy.deps);
    expect(events[0]).toMatchObject({ type: 'test-result', ok: false, errorCode: 'auth' });
  });

  it('probes a model through testConnection with the joined profile', async () => {
    const spy = spyClient();
    const { emit, events } = collector();
    await handleRequest({ kind: 'test-model', modelId: 'm1' }, emit, spy.deps);
    expect(spy.testConnection).toHaveBeenCalled();
    expect(spy.seen[0]).toMatchObject({ model: 'gpt-4o-mini', apiKey: 'sk' });
    expect(events).toEqual([
      { type: 'test-result', ok: true, latencyMs: 42, errorCode: undefined, message: undefined },
    ]);
  });

  it('emits not_found for an unknown model id', async () => {
    const spy = spyClient();
    const { emit, events } = collector();
    await handleRequest({ kind: 'test-model', modelId: 'ghost' }, emit, spy.deps);
    expect(events[0]).toMatchObject({ type: 'error', code: 'not_found' });
  });

  it('emits not_found when a model points at a provider that is gone', async () => {
    const spy = spyClient();
    const { emit, events } = collector();
    await handleRequest({ kind: 'test-model', modelId: 'orphan' }, emit, spy.deps);
    expect(events[0]).toMatchObject({ type: 'error', code: 'not_found' });
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
        getSettings: async () => settingsWith(),
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
      getSettings: async () => settingsWith(),
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
      getSettings: async () => settingsWith(),
      resolveProfile: async () => profile,
      createClient: () => client,
      selectionCache: fakeCache(),
    };

    await handleRequest(streamReq, collector().emit, deps);
    await handleRequest({ ...streamReq, bypassCache: true }, collector().emit, deps);

    expect(streamSpy).toHaveBeenCalledTimes(2);
  });
});

describe('handleRequest translate-image', () => {
  const imageReq: BgRequest = {
    kind: 'translate-image',
    feature: 'image',
    image: { mediaType: 'image/jpeg', dataBase64: 'AAAA' },
    vars: { targetLang: 'zh-CN' },
  };

  it('resolves the image feature and streams with the image attached', async () => {
    const seen: Array<Parameters<TranslationClient['stream']>[0]> = [];
    const client = fakeClient({
      stream: async (req, onDelta) => {
        seen.push(req);
        onDelta('你好');
        return { text: '你好' };
      },
    });
    const features: string[] = [];
    const { emit, events } = collector();
    await handleRequest(imageReq, emit, {
      getSettings: async () => settingsWith(),
      resolveProfile: async (feature) => {
        features.push(feature);
        return profile;
      },
      createClient: () => client,
    });

    expect(features).toEqual(['image']);
    expect(seen[0].images).toEqual([{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }]);
    expect(seen[0].system).toContain('zh-CN');
    expect(events).toEqual([
      { type: 'delta', text: '你好' },
      { type: 'done', usage: undefined },
    ]);
  });

  it('never touches the caches (images are uncached by design)', async () => {
    const cache = { get: vi.fn(), set: vi.fn() } as unknown as TranslationCache;
    const { emit } = collector();
    await handleRequest(imageReq, emit, {
      getSettings: async () => settingsWith(),
      resolveProfile: async () => profile,
      createClient: () => fakeClient({ stream: async () => ({ text: 'x' }) }),
      selectionCache: cache,
      pageCache: cache,
    });
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('emits not_found when no provider resolves', async () => {
    const { emit, events } = collector();
    await handleRequest(imageReq, emit, {
      getSettings: async () => DEFAULT_SETTINGS,
      resolveProfile: async () => null,
      createClient: () => fakeClient({}),
    });
    expect(events).toEqual([
      { type: 'error', code: 'not_found', message: 'No provider configured' },
    ]);
  });
});

describe('handleRequest search-stream', () => {
  const searchReq: BgRequest = {
    kind: 'search-stream',
    feature: 'search',
    vars: { text: 'WXT framework', targetLang: 'zh-CN' },
  };

  it('resolves the search feature and streams the search prompt on the selection', async () => {
    const seen: Array<Parameters<TranslationClient['stream']>[0]> = [];
    const client = fakeClient({
      stream: async (req, onDelta) => {
        seen.push(req);
        onDelta('WXT 是');
        return { text: 'WXT 是' };
      },
    });
    const features: string[] = [];
    const { emit, events } = collector();
    await handleRequest(searchReq, emit, {
      getSettings: async () => settingsWith(),
      resolveProfile: async (feature) => {
        features.push(feature);
        return profile;
      },
      createClient: () => client,
    });

    expect(features).toEqual(['search']);
    expect(seen[0].user).toBe('WXT framework');
    expect(seen[0].system).toMatch(/search/i);
    expect(seen[0].system).toContain('zh-CN');
    expect(events).toEqual([
      { type: 'delta', text: 'WXT 是' },
      { type: 'done', usage: undefined },
    ]);
  });

  it('never reads or writes the selection cache, so a repeat search hits the model again', async () => {
    const cache = { get: vi.fn(), set: vi.fn() } as unknown as TranslationCache;
    const streamSpy = vi.fn(async () => ({ text: 'x' }));
    const deps = {
      getSettings: async () => settingsWith(),
      resolveProfile: async () => profile,
      createClient: () =>
        fakeClient({ stream: streamSpy as unknown as TranslationClient['stream'] }),
      selectionCache: cache,
      pageCache: cache,
    };
    await handleRequest(searchReq, collector().emit, deps);
    await handleRequest(searchReq, collector().emit, deps);

    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('uses the selectionSearch prompt override from settings', async () => {
    const seen: string[] = [];
    await handleRequest(searchReq, collector().emit, {
      getSettings: async () => ({
        ...settingsWith(),
        prompts: { selectionSearch: 'Look up {{text}} and answer in {{targetLang}}.' },
      }),
      resolveProfile: async () => profile,
      createClient: () =>
        fakeClient({
          stream: async (req) => {
            seen.push(req.system);
            return { text: '' };
          },
        }),
    });
    expect(seen).toEqual(['Look up WXT framework and answer in zh-CN.']);
  });

  it('emits not_found when no provider resolves', async () => {
    const { emit, events } = collector();
    await handleRequest(searchReq, emit, {
      getSettings: async () => DEFAULT_SETTINGS,
      resolveProfile: async () => null,
      createClient: () => fakeClient({}),
    });
    expect(events).toEqual([
      { type: 'error', code: 'not_found', message: 'No provider configured' },
    ]);
  });
});
