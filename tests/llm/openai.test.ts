import { describe, expect, it } from 'vitest';
import { createOpenAiClient } from '@/llm/openai';
import { LlmError, type ProviderProfile } from '@/llm/types';
import {
  bodyOf,
  hangingFetch,
  headerOf,
  jsonResponse,
  neverClosingBody,
  recordingFetch,
  sseResponse,
} from '../helpers';

const profile: ProviderProfile = {
  id: 'p1',
  name: 'OpenAI',
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
};

const req = { system: 'SYS', user: 'hi', model: 'gpt-4o-mini' } as const;

describe('createOpenAiClient.stream', () => {
  it('accumulates delta content and reports each delta', async () => {
    const fetchImpl = recordingFetch(() =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    const deltas: string[] = [];
    const result = await client.stream(req, (d) => deltas.push(d));

    expect(deltas).toEqual(['Hel', 'lo']);
    expect(result.text).toBe('Hello');
  });

  it('POSTs to the chat endpoint with Bearer auth and stream=true', async () => {
    const fetchImpl = recordingFetch(() =>
      sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', 'data: [DONE]\n\n']),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    await client.stream(req, () => {});

    const call = fetchImpl.calls[0];
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(call.init.method).toBe('POST');
    expect(headerOf(call, 'authorization')).toBe('Bearer sk-test');
    const body = bodyOf(call);
    expect(body.stream).toBe(true);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('normalizes a base URL entered without /v1', async () => {
    const fetchImpl = recordingFetch(() =>
      sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', 'data: [DONE]\n\n']),
    );
    const client = createOpenAiClient(
      { ...profile, baseUrl: 'https://api.openai.com' },
      { fetchImpl },
    );
    await client.stream(req, () => {});
    expect(fetchImpl.calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('throws when the stream carries an SSE error event instead of deltas', async () => {
    // Verbatim shape observed from an OpenAI-compatible gateway (2026-07-15):
    // keepalive comments, then an error event on an HTTP 200 stream.
    const fetchImpl = recordingFetch(() =>
      sseResponse([
        ': omniroute-keepalive\n\n',
        'event: error\ndata: {"error":{"message":"[openrouter/deepseek/deepseek-v4-flash] [404]: No endpoints found that support image input (reset after 2m)"}}\n\n',
      ]),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    await expect(client.stream(req, () => {})).rejects.toMatchObject({
      code: 'server',
      message: expect.stringContaining('No endpoints found that support image input'),
    });
  });

  it('throws when an error payload arrives without an event name', async () => {
    const fetchImpl = recordingFetch(() =>
      sseResponse(['data: {"error":{"message":"quota exceeded"}}\n\n', 'data: [DONE]\n\n']),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    await expect(client.stream(req, () => {})).rejects.toMatchObject({
      code: 'server',
      message: expect.stringContaining('quota exceeded'),
    });
  });

  it('throws bad_response when the stream ends without any content', async () => {
    const fetchImpl = recordingFetch(() => sseResponse([': keepalive\n\n', 'data: [DONE]\n\n']));
    const client = createOpenAiClient(profile, { fetchImpl });
    await expect(client.stream(req, () => {})).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('sends image content parts when the request carries images', async () => {
    const fetchImpl = recordingFetch(() =>
      sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', 'data: [DONE]\n\n']),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    await client.stream(
      { ...req, images: [{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }] },
      () => {},
    );

    const body = bodyOf(fetchImpl.calls[0]);
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYS' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
          { type: 'text', text: 'hi' },
        ],
      },
    ]);
  });

  it('keeps user content a plain string when there are no images', async () => {
    const fetchImpl = recordingFetch(() =>
      sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', 'data: [DONE]\n\n']),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    await client.stream({ ...req, images: [] }, () => {});
    const body = bodyOf(fetchImpl.calls[0]);
    expect((body.messages as Array<{ role: string; content: unknown }>)[1]).toEqual({
      role: 'user',
      content: 'hi',
    });
  });
});

describe('createOpenAiClient stall watchdog', () => {
  it('fails a stalled SSE stream with code=timeout instead of hanging', async () => {
    const fetchImpl = recordingFetch(
      () =>
        new Response(neverClosingBody(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    const client = createOpenAiClient(profile, { fetchImpl, idleMs: 50 });
    await expect(client.stream(req, () => {})).rejects.toMatchObject({ code: 'timeout' });
  });

  it('still maps the status when an error body never closes', async () => {
    const fetchImpl = recordingFetch(() => new Response(neverClosingBody(), { status: 404 }));
    const client = createOpenAiClient(profile, { fetchImpl, idleMs: 50 });
    await expect(client.stream(req, () => {})).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('createOpenAiClient.complete', () => {
  it('returns the message content and token usage', async () => {
    const fetchImpl = recordingFetch(() =>
      jsonResponse({
        choices: [{ message: { content: 'Bonjour' } }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    const result = await client.complete(req);

    expect(result.text).toBe('Bonjour');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 3 });
    expect(bodyOf(fetchImpl.calls[0]).stream).toBe(false);
  });
});

describe('createOpenAiClient error mapping', () => {
  const cases: Array<[number, string]> = [
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not_found'],
    [500, 'server'],
    [400, 'bad_response'],
  ];
  for (const [status, code] of cases) {
    it(`maps HTTP ${status} to ${code}`, async () => {
      const fetchImpl = recordingFetch(() => jsonResponse({ error: { message: 'nope' } }, status));
      const client = createOpenAiClient(profile, { fetchImpl });
      await expect(client.complete(req)).rejects.toMatchObject({
        name: 'LlmError',
        code,
        status,
      });
    });
  }

  it('parses Retry-After on 429', async () => {
    const fetchImpl = recordingFetch(
      () =>
        new Response(JSON.stringify({ error: { message: 'slow' } }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '7' },
        }),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    const err = await client.complete(req).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.code).toBe('rate_limit');
    expect(err.retryAfterSeconds).toBe(7);
  });

  it('maps a timeout to code=timeout', async () => {
    const client = createOpenAiClient(
      { ...profile, params: { timeoutMs: 20 } },
      { fetchImpl: hangingFetch() },
    );
    await expect(client.complete(req)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('maps an external abort to code=aborted', async () => {
    const controller = new AbortController();
    const client = createOpenAiClient(profile, { fetchImpl: hangingFetch() });
    const promise = client.complete(req, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'aborted' });
  });
});

describe('createOpenAiClient.listModels', () => {
  it('returns model ids from the models endpoint', async () => {
    const fetchImpl = recordingFetch(() =>
      jsonResponse({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    expect(await client.listModels()).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  it('throws a mapped error on failure (client factory swallows later)', async () => {
    const fetchImpl = recordingFetch(() => jsonResponse({}, 401));
    const client = createOpenAiClient(profile, { fetchImpl });
    await expect(client.listModels()).rejects.toMatchObject({ code: 'auth' });
  });
});

describe('createOpenAiClient.testConnection', () => {
  it('returns ok with a latency on success', async () => {
    const fetchImpl = recordingFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    const result = await client.testConnection();
    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
  });

  it('returns ok=false with the error on failure', async () => {
    const fetchImpl = recordingFetch(() => jsonResponse({}, 401));
    const client = createOpenAiClient(profile, { fetchImpl });
    const result = await client.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('auth');
  });
});
