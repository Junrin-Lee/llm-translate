import { describe, expect, it } from 'vitest';
import { createOpenAiClient } from '@/llm/openai';
import { LlmError, type ResolvedProfile } from '@/llm/types';
import {
  bodyOf,
  hangingFetch,
  headerOf,
  jsonResponse,
  neverClosingBody,
  recordingFetch,
  sseResponse,
} from '../helpers';

const profile: ResolvedProfile = {
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

describe('createOpenAiClient opencode session header', () => {
  it('sends x-opencode-session (profile id) only to opencode.ai hosts', async () => {
    const ok = () => jsonResponse({ choices: [{ message: { content: 'ok' } }] });
    const go = recordingFetch(ok);
    await createOpenAiClient(
      { ...profile, baseUrl: 'https://opencode.ai/zen/v1' },
      { fetchImpl: go },
    ).complete(req);
    expect(headerOf(go.calls[0], 'x-opencode-session')).toBe('p1');

    const other = recordingFetch(ok);
    await createOpenAiClient(profile, { fetchImpl: other }).complete(req);
    expect(headerOf(other.calls[0], 'x-opencode-session')).toBeUndefined();
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

  it('passes when a reasoning model spends the 1-token budget and returns null content', async () => {
    const fetchImpl = recordingFetch(() =>
      jsonResponse({
        choices: [
          { message: { content: null, reasoning_content: 'The' }, finish_reason: 'length' },
        ],
      }),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    const result = await client.testConnection();
    expect(result.ok).toBe(true);
  });

  it('fails on a 200 that carries an error payload', async () => {
    const fetchImpl = recordingFetch(() =>
      jsonResponse({ error: { message: 'model does not exist' } }),
    );
    const client = createOpenAiClient(profile, { fetchImpl });
    const result = await client.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('model does not exist');
  });

  it('fails on a 200 that is not JSON (wrong base URL hitting a web page)', async () => {
    const fetchImpl = recordingFetch(() => new Response('<html>hello</html>', { status: 200 }));
    const client = createOpenAiClient(profile, { fetchImpl });
    const result = await client.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('bad_response');
  });
});

describe('createOpenAiClient max_completion_tokens fallback', () => {
  // What OpenAI answers for o-series and gpt-5 when the request carries max_tokens.
  const unsupportedMaxTokens = () =>
    jsonResponse(
      {
        error: {
          message:
            "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
          type: 'invalid_request_error',
          param: 'max_tokens',
          code: 'unsupported_parameter',
        },
      },
      400,
    );
  const ok = () => jsonResponse({ choices: [{ message: { content: 'ok' } }] });
  // The switch is remembered per endpoint + model for the worker's lifetime, so
  // each case uses its own model id to stay independent of the others.
  const withModel = (model: string, extra: Partial<ResolvedProfile> = {}) => ({
    ...profile,
    model,
    ...extra,
  });

  /** Answer like OpenAI's reasoning models: reject max_tokens, accept the new name. */
  const reasoningFetch = () =>
    recordingFetch((_url, init) => {
      const body = JSON.parse(init.body as string);
      return 'max_tokens' in body ? unsupportedMaxTokens() : ok();
    });

  it('retries the model test with max_completion_tokens', async () => {
    const fetchImpl = reasoningFetch();
    const client = createOpenAiClient(withModel('o3'), { fetchImpl });
    const result = await client.testConnection();

    expect(result.ok).toBe(true);
    expect(fetchImpl.calls).toHaveLength(2);
    expect(bodyOf(fetchImpl.calls[1])).toMatchObject({ max_completion_tokens: 1 });
    expect(bodyOf(fetchImpl.calls[1])).not.toHaveProperty('max_tokens');
  });

  it('keeps a user-set cap when translating with such a model', async () => {
    const fetchImpl = reasoningFetch();
    const client = createOpenAiClient(withModel('gpt-5', { params: { maxTokens: 512 } }), {
      fetchImpl,
    });
    const result = await client.complete({ ...req, model: 'gpt-5' });

    expect(result.text).toBe('ok');
    expect(bodyOf(fetchImpl.calls[1])).toMatchObject({ max_completion_tokens: 512 });
  });

  it('remembers the switch for later clients of the same endpoint and model', async () => {
    const fetchImpl = reasoningFetch();
    // The background builds a fresh client for every request.
    await createOpenAiClient(withModel('o4-mini'), { fetchImpl }).testConnection();
    await createOpenAiClient(withModel('o4-mini'), { fetchImpl }).testConnection();

    expect(fetchImpl.calls).toHaveLength(3);
    expect(bodyOf(fetchImpl.calls[2])).toMatchObject({ max_completion_tokens: 1 });
  });

  it('does not retry an unrelated 400 and keeps its message', async () => {
    const fetchImpl = recordingFetch(() =>
      jsonResponse({ error: { message: 'The model `nope` does not exist' } }, 400),
    );
    const client = createOpenAiClient(withModel('nope'), { fetchImpl });
    const result = await client.testConnection();

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('The model `nope` does not exist');
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it('does not touch requests that carry no cap', async () => {
    const fetchImpl = recordingFetch(() => unsupportedMaxTokens());
    const client = createOpenAiClient(withModel('o1'), { fetchImpl });
    await expect(client.complete({ ...req, model: 'o1' })).rejects.toThrow(/max_completion_tokens/);
    expect(fetchImpl.calls).toHaveLength(1);
  });
});
