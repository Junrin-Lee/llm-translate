import { endpointFor, normalizeBaseUrl } from './base-url';
import { DEFAULT_TIMEOUT_MS, errorFromResponse, type FetchLike, fetchWithTimeout } from './http';
import { parseSse } from './sse';
import {
  type ChatRequest,
  type ChatResult,
  LlmError,
  type ProviderProfile,
  type TestResult,
  type TranslationClient,
} from './types';

export interface AdapterDeps {
  fetchImpl?: FetchLike;
}

interface OpenAiBody {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
}

/** A TranslationClient speaking the OpenAI Chat Completions protocol. */
export function createOpenAiClient(
  profile: ProviderProfile,
  deps: AdapterDeps = {},
): TranslationClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = normalizeBaseUrl(profile.baseUrl, 'openai');
  const timeoutMs = profile.params?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${profile.apiKey}`,
  };

  function buildBody(req: ChatRequest, stream: boolean): OpenAiBody {
    const messages: OpenAiBody['messages'] = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content: req.user });

    const body: OpenAiBody = { model: req.model, messages, stream };
    const temperature = req.temperature ?? profile.params?.temperature;
    if (temperature !== undefined) body.temperature = temperature;
    const maxTokens = req.maxTokens ?? profile.params?.maxTokens;
    if (maxTokens !== undefined) body.max_tokens = maxTokens;
    return body;
  }

  function postChat(body: OpenAiBody, signal?: AbortSignal): Promise<Response> {
    return fetchWithTimeout(
      fetchImpl,
      endpointFor(base, 'openai', 'chat'),
      { method: 'POST', headers, body: JSON.stringify(body) },
      timeoutMs,
      signal,
    );
  }

  async function stream(
    req: ChatRequest,
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResult> {
    const res = await postChat(buildBody(req, true), signal);
    if (!res.ok) throw await errorFromResponse(res);
    if (!res.body) throw new LlmError('bad_response', 'Streaming response had no body');

    let text = '';
    for await (const ev of parseSse(res.body)) {
      if (ev.data === '[DONE]') break;
      let json: unknown;
      try {
        json = JSON.parse(ev.data);
      } catch {
        continue; // ignore keep-alive / non-JSON frames
      }
      const delta = (json as { choices?: Array<{ delta?: { content?: unknown } }> })?.choices?.[0]
        ?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        text += delta;
        onDelta(delta);
      }
    }
    return { text };
  }

  async function complete(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
    const res = await postChat(buildBody(req, false), signal);
    if (!res.ok) throw await errorFromResponse(res);

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LlmError('bad_response', 'Response contained no message content');
    }
    const usage = json.usage
      ? {
          inputTokens: json.usage.prompt_tokens ?? 0,
          outputTokens: json.usage.completion_tokens ?? 0,
        }
      : undefined;
    return { text: content, usage };
  }

  async function listModels(): Promise<string[]> {
    const res = await fetchWithTimeout(
      fetchImpl,
      endpointFor(base, 'openai', 'models'),
      { method: 'GET', headers },
      timeoutMs,
    );
    if (!res.ok) throw await errorFromResponse(res);
    const json = (await res.json()) as { data?: Array<{ id?: unknown }> };
    if (!Array.isArray(json?.data)) return [];
    return json.data.map((m) => m?.id).filter((id): id is string => typeof id === 'string');
  }

  async function testConnection(): Promise<TestResult> {
    const start = Date.now();
    try {
      await complete({ system: '', user: 'ping', model: profile.model, maxTokens: 1 });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof LlmError ? error : new LlmError('network', String(error)),
      };
    }
  }

  return { stream, complete, listModels, testConnection };
}
