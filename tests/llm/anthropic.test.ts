import { describe, expect, it } from 'vitest';
import { createAnthropicClient } from '@/llm/anthropic';
import { LlmError, type ProviderProfile } from '@/llm/types';
import {
  bodyOf,
  hangingFetch,
  headerOf,
  jsonResponse,
  recordingFetch,
  sseResponse,
} from '../helpers';

const profile: ProviderProfile = {
  id: 'a1',
  name: 'Anthropic',
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'ak-test',
  model: 'claude-3-5-sonnet-latest',
};

const req = { system: 'SYS', user: 'hi', model: 'claude-3-5-sonnet-latest' } as const;

function deltaChunk(text: string): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text },
  })}\n\n`;
}

describe('createAnthropicClient.stream', () => {
  it('accumulates text_delta content and reports each delta', async () => {
    const fetchImpl = recordingFetch(() =>
      sseResponse([
        'event: message_start\ndata: {"type":"message_start"}\n\n',
        deltaChunk('Hel'),
        deltaChunk('lo'),
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    );
    const client = createAnthropicClient(profile, { fetchImpl });
    const deltas: string[] = [];
    const result = await client.stream(req, (d) => deltas.push(d));

    expect(deltas).toEqual(['Hel', 'lo']);
    expect(result.text).toBe('Hello');
  });

  it('POSTs to /v1/messages with x-api-key, version and browser-access headers', async () => {
    const fetchImpl = recordingFetch(() =>
      sseResponse(['event: message_stop\ndata: {"type":"message_stop"}\n\n']),
    );
    const client = createAnthropicClient(profile, { fetchImpl });
    await client.stream(req, () => {});

    const call = fetchImpl.calls[0];
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    expect(headerOf(call, 'x-api-key')).toBe('ak-test');
    expect(headerOf(call, 'anthropic-version')).toBe('2023-06-01');
    expect(headerOf(call, 'anthropic-dangerous-direct-browser-access')).toBe('true');

    const body = bodyOf(call);
    expect(body.stream).toBe(true);
    expect(body.system).toBe('SYS');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    // max_tokens is required by the API; defaults to 4096 when unset.
    expect(body.max_tokens).toBe(4096);
  });

  it('honors an explicit maxTokens override', async () => {
    const fetchImpl = recordingFetch(() =>
      sseResponse(['event: message_stop\ndata: {"type":"message_stop"}\n\n']),
    );
    const client = createAnthropicClient(profile, { fetchImpl });
    await client.stream({ ...req, maxTokens: 128 }, () => {});
    expect(bodyOf(fetchImpl.calls[0]).max_tokens).toBe(128);
  });

  it('sends image source blocks when the request carries images', async () => {
    const fetchImpl = recordingFetch(() => sseResponse(['data: {"type":"message_stop"}\n\n']));
    const client = createAnthropicClient(profile, { fetchImpl });
    await client.stream(
      { ...req, images: [{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }] },
      () => {},
    );

    const body = bodyOf(fetchImpl.calls[0]);
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' },
          },
          { type: 'text', text: 'hi' },
        ],
      },
    ]);
  });
});

describe('createAnthropicClient.complete', () => {
  it('joins text content blocks and maps token usage', async () => {
    const fetchImpl = recordingFetch(() =>
      jsonResponse({
        content: [
          { type: 'text', text: 'Bon' },
          { type: 'text', text: 'jour' },
        ],
        usage: { input_tokens: 10, output_tokens: 3 },
      }),
    );
    const client = createAnthropicClient(profile, { fetchImpl });
    const result = await client.complete(req);

    expect(result.text).toBe('Bonjour');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 3 });
    expect(bodyOf(fetchImpl.calls[0]).stream).toBe(false);
  });
});

describe('createAnthropicClient error mapping', () => {
  const cases: Array<[number, string]> = [
    [401, 'auth'],
    [404, 'not_found'],
    [500, 'server'],
    [400, 'bad_response'],
  ];
  for (const [status, code] of cases) {
    it(`maps HTTP ${status} to ${code}`, async () => {
      const fetchImpl = recordingFetch(() =>
        jsonResponse({ type: 'error', error: { type: 'x', message: 'nope' } }, status),
      );
      const client = createAnthropicClient(profile, { fetchImpl });
      await expect(client.complete(req)).rejects.toMatchObject({ code, status });
    });
  }

  it('parses Retry-After on 429', async () => {
    const fetchImpl = recordingFetch(
      () =>
        new Response(JSON.stringify({ error: { message: 'slow' } }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '5' },
        }),
    );
    const client = createAnthropicClient(profile, { fetchImpl });
    const err = await client.complete(req).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.code).toBe('rate_limit');
    expect(err.retryAfterSeconds).toBe(5);
  });

  it('maps a timeout to code=timeout', async () => {
    const client = createAnthropicClient(
      { ...profile, params: { timeoutMs: 20 } },
      { fetchImpl: hangingFetch() },
    );
    await expect(client.complete(req)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('maps an external abort to code=aborted', async () => {
    const controller = new AbortController();
    const client = createAnthropicClient(profile, { fetchImpl: hangingFetch() });
    const promise = client.complete(req, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'aborted' });
  });
});

describe('createAnthropicClient.listModels', () => {
  it('returns model ids and de-dupes /v1 in the endpoint', async () => {
    const fetchImpl = recordingFetch(() =>
      jsonResponse({
        data: [{ id: 'claude-3-5-sonnet-latest' }, { id: 'claude-3-5-haiku-latest' }],
      }),
    );
    const client = createAnthropicClient(
      { ...profile, baseUrl: 'https://api.anthropic.com/v1' },
      {
        fetchImpl,
      },
    );
    expect(await client.listModels()).toEqual([
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
    ]);
    expect(fetchImpl.calls[0].url).toBe('https://api.anthropic.com/v1/models');
  });
});

describe('createAnthropicClient.testConnection', () => {
  it('returns ok=false with the error on failure', async () => {
    const fetchImpl = recordingFetch(() => jsonResponse({}, 401));
    const client = createAnthropicClient(profile, { fetchImpl });
    const result = await client.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('auth');
  });
});
