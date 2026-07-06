import { describe, expect, it } from 'vitest';
import { createClient } from '@/llm/client';
import type { ProviderProfile } from '@/llm/types';
import { jsonResponse, recordingFetch, sseResponse } from '../helpers';

const openai: ProviderProfile = {
  id: 'o',
  name: 'o',
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk',
  model: 'gpt-4o-mini',
};
const anthropic: ProviderProfile = {
  id: 'a',
  name: 'a',
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'ak',
  model: 'claude-3-5-sonnet-latest',
};
const req = { system: 'S', user: 'u', model: 'm' } as const;
const noSleep = async () => {};

describe('createClient dispatch', () => {
  it('routes openai profiles to the chat completions endpoint', async () => {
    const fetchImpl = recordingFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'x' } }] }),
    );
    await createClient(openai, { fetchImpl, sleep: noSleep }).complete(req);
    expect(fetchImpl.calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('routes anthropic profiles to the messages endpoint', async () => {
    const fetchImpl = recordingFetch(() =>
      jsonResponse({ content: [{ type: 'text', text: 'x' }] }),
    );
    await createClient(anthropic, { fetchImpl, sleep: noSleep }).complete(req);
    expect(fetchImpl.calls[0].url).toBe('https://api.anthropic.com/v1/messages');
  });
});

describe('createClient retry', () => {
  it('retries on 429 and succeeds, waiting Retry-After between attempts', async () => {
    let n = 0;
    const fetchImpl = recordingFetch(() => {
      n += 1;
      return n <= 2
        ? jsonResponse({ error: { message: 'slow' } }, 429, { 'retry-after': '1' })
        : jsonResponse({ choices: [{ message: { content: 'ok' } }] });
    });
    const sleeps: number[] = [];
    const client = createClient(openai, {
      fetchImpl,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const result = await client.complete(req);
    expect(result.text).toBe('ok');
    expect(fetchImpl.calls).toHaveLength(3);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it('retries 5xx with exponential backoff', async () => {
    let n = 0;
    const fetchImpl = recordingFetch(() => {
      n += 1;
      return n <= 2
        ? jsonResponse({}, 500)
        : jsonResponse({ choices: [{ message: { content: 'ok' } }] });
    });
    const sleeps: number[] = [];
    await createClient(openai, {
      fetchImpl,
      baseDelayMs: 100,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    }).complete(req);
    expect(sleeps).toEqual([100, 200]);
  });

  it('gives up after maxRetries and throws the last error', async () => {
    const fetchImpl = recordingFetch(() => jsonResponse({}, 500));
    const client = createClient(openai, { fetchImpl, maxRetries: 2, sleep: noSleep });
    await expect(client.complete(req)).rejects.toMatchObject({ code: 'server' });
    expect(fetchImpl.calls).toHaveLength(3); // initial + 2 retries
  });

  it('does not retry non-retryable errors like auth', async () => {
    const fetchImpl = recordingFetch(() => jsonResponse({}, 401));
    const client = createClient(openai, { fetchImpl, sleep: noSleep });
    await expect(client.complete(req)).rejects.toMatchObject({ code: 'auth' });
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it('retries a stream that fails before emitting any delta', async () => {
    let n = 0;
    const fetchImpl = recordingFetch(() => {
      n += 1;
      return n <= 1
        ? jsonResponse({}, 503)
        : sseResponse(['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', 'data: [DONE]\n\n']);
    });
    const client = createClient(openai, { fetchImpl, sleep: noSleep });
    const deltas: string[] = [];
    const result = await client.stream(req, (d) => deltas.push(d));
    expect(result.text).toBe('hi');
    expect(deltas).toEqual(['hi']);
    expect(fetchImpl.calls).toHaveLength(2);
  });
});

describe('createClient.listModels', () => {
  it('swallows errors and returns an empty list', async () => {
    const fetchImpl = recordingFetch(() => jsonResponse({}, 401));
    const client = createClient(openai, { fetchImpl, sleep: noSleep });
    expect(await client.listModels()).toEqual([]);
  });

  it('returns model ids on success', async () => {
    const fetchImpl = recordingFetch(() => jsonResponse({ data: [{ id: 'gpt-4o' }] }));
    const client = createClient(openai, { fetchImpl, sleep: noSleep });
    expect(await client.listModels()).toEqual(['gpt-4o']);
  });
});
