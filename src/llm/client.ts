import { createAnthropicClient } from './anthropic';
import type { AdapterDeps } from './http';
import { createOpenAiClient } from './openai';
import {
  type ChatRequest,
  type ChatResult,
  LlmError,
  type ProviderProfile,
  type TranslationClient,
} from './types';

export interface ClientDeps extends AdapterDeps {
  /** Max retry attempts for transient failures (default 2). */
  maxRetries?: number;
  /** Base backoff in ms for exponential retry (default 500). */
  baseDelayMs?: number;
  /** Injectable sleep (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE: ReadonlySet<string> = new Set(['rate_limit', 'server']);

function backoffMs(error: unknown, attempt: number, baseDelayMs: number): number {
  if (error instanceof LlmError && error.code === 'rate_limit' && error.retryAfterSeconds != null) {
    return error.retryAfterSeconds * 1000;
  }
  return baseDelayMs * 2 ** attempt;
}

/**
 * Build a TranslationClient for a profile: dispatches on protocol, retries
 * transient failures (429 honoring Retry-After, and 5xx with exponential
 * backoff) up to maxRetries, and makes listModels non-throwing.
 */
export function createClient(profile: ProviderProfile, deps: ClientDeps = {}): TranslationClient {
  const adapter =
    profile.protocol === 'anthropic'
      ? createAnthropicClient(profile, deps)
      : createOpenAiClient(profile, deps);

  const maxRetries = deps.maxRetries ?? 2;
  const baseDelayMs = deps.baseDelayMs ?? 500;
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));

  async function withRetry<T>(op: () => Promise<T>, canRetry: () => boolean): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await op();
      } catch (error) {
        lastError = error;
        const retryable = error instanceof LlmError && RETRYABLE.has(error.code);
        if (attempt >= maxRetries || !retryable || !canRetry()) throw error;
        await sleep(backoffMs(error, attempt, baseDelayMs));
      }
    }
    throw lastError;
  }

  return {
    stream(req: ChatRequest, onDelta: (text: string) => void, signal?: AbortSignal) {
      // Only retry while nothing has been emitted, so retries never duplicate
      // already-streamed text. 429/5xx surface before the first delta.
      let emitted = false;
      const trackedOnDelta = (text: string) => {
        emitted = true;
        onDelta(text);
      };
      return withRetry(
        () => adapter.stream(req, trackedOnDelta, signal),
        () => !emitted,
      );
    },
    complete(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
      return withRetry(
        () => adapter.complete(req, signal),
        () => true,
      );
    },
    async listModels(): Promise<string[]> {
      try {
        return await adapter.listModels();
      } catch {
        return [];
      }
    },
    testConnection: () => adapter.testConnection(),
  };
}
