import { endpointFor, normalizeBaseUrl } from './base-url';
import { type AdapterDeps, DEFAULT_TIMEOUT_MS, errorFromResponse, fetchWithTimeout } from './http';
import { parseSse } from './sse';
import {
  type ChatRequest,
  type ChatResult,
  LlmError,
  type ProviderProfile,
  type TestResult,
  type TranslationClient,
} from './types';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

type AnthropicUserContent =
  | string
  | Array<
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'text'; text: string }
    >;

interface AnthropicBody {
  model: string;
  messages: Array<{ role: 'user'; content: AnthropicUserContent }>;
  max_tokens: number;
  stream: boolean;
  system?: string;
  temperature?: number;
}

/** A TranslationClient speaking the Anthropic Messages protocol. */
export function createAnthropicClient(
  profile: ProviderProfile,
  deps: AdapterDeps = {},
): TranslationClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = normalizeBaseUrl(profile.baseUrl, 'anthropic');
  const timeoutMs = profile.params?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': profile.apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    // Required to call the official API from an extension (browser) context;
    // harmless for compatible gateways. See ADR-0003 / docs/plan.md.
    'anthropic-dangerous-direct-browser-access': 'true',
  };

  function buildBody(req: ChatRequest, stream: boolean): AnthropicBody {
    const userContent: AnthropicUserContent =
      req.images && req.images.length > 0
        ? [
            ...req.images.map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: img.mediaType,
                data: img.dataBase64,
              },
            })),
            { type: 'text' as const, text: req.user },
          ]
        : req.user;
    const body: AnthropicBody = {
      model: req.model,
      messages: [{ role: 'user', content: userContent }],
      max_tokens: req.maxTokens ?? profile.params?.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream,
    };
    if (req.system) body.system = req.system;
    const temperature = req.temperature ?? profile.params?.temperature;
    if (temperature !== undefined) body.temperature = temperature;
    return body;
  }

  function postMessages(body: AnthropicBody, signal?: AbortSignal): Promise<Response> {
    return fetchWithTimeout(
      fetchImpl,
      endpointFor(base, 'anthropic', 'chat'),
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
    const res = await postMessages(buildBody(req, true), signal);
    if (!res.ok) throw await errorFromResponse(res);
    if (!res.body) throw new LlmError('bad_response', 'Streaming response had no body');

    let text = '';
    for await (const ev of parseSse(res.body)) {
      let json: {
        type?: string;
        delta?: { type?: string; text?: unknown };
        error?: { message?: unknown };
      };
      try {
        json = JSON.parse(ev.data);
      } catch {
        // A non-JSON error frame still carries the failure signal.
        if (ev.event === 'error') throw new LlmError('server', ev.data);
        continue;
      }
      // Anthropic's documented stream-error shape — surface, don't swallow.
      if (ev.event === 'error' || json.type === 'error') {
        const message = json.error?.message;
        throw new LlmError(
          'server',
          typeof message === 'string' ? message : 'Provider reported a stream error',
        );
      }
      if (json.type === 'message_stop') break;
      if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
        const chunk = json.delta.text;
        if (typeof chunk === 'string' && chunk.length > 0) {
          text += chunk;
          onDelta(chunk);
        }
      }
    }
    // A stream that closes without producing anything is a failure for a
    // translator, not an empty success (silent-close gateways end up here).
    if (text === '') throw new LlmError('bad_response', 'The stream ended without any content');
    return { text };
  }

  async function complete(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
    const res = await postMessages(buildBody(req, false), signal);
    if (!res.ok) throw await errorFromResponse(res);

    const json = (await res.json()) as {
      content?: Array<{ type?: string; text?: unknown }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    if (!Array.isArray(json?.content)) {
      throw new LlmError('bad_response', 'Response contained no content');
    }
    const text = json.content
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');
    const usage = json.usage
      ? {
          inputTokens: json.usage.input_tokens ?? 0,
          outputTokens: json.usage.output_tokens ?? 0,
        }
      : undefined;
    return { text, usage };
  }

  async function listModels(): Promise<string[]> {
    const res = await fetchWithTimeout(
      fetchImpl,
      endpointFor(base, 'anthropic', 'models'),
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
