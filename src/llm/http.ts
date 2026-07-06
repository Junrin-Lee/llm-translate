import { LlmError } from './types';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const DEFAULT_TIMEOUT_MS = 60_000;

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Pull a human-readable message out of an error response body. */
function extractMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    const json = JSON.parse(trimmed);
    const msg = json?.error?.message ?? json?.error ?? json?.message;
    if (typeof msg === 'string') return truncate(msg, 300);
  } catch {
    // not JSON — fall through
  }
  return truncate(trimmed, 300);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : undefined;
}

/** Map a non-2xx response to a normalized LlmError, with a safe detail snippet. */
export async function errorFromResponse(res: Response): Promise<LlmError> {
  const status = res.status;
  let detail = '';
  try {
    detail = extractMessage(await res.text());
  } catch {
    // body already consumed or unreadable — ignore
  }
  const suffix = detail ? `: ${detail}` : '';

  if (status === 401 || status === 403) {
    return new LlmError('auth', `Authentication failed (${status})${suffix}`, { status });
  }
  if (status === 404) {
    return new LlmError('not_found', `Endpoint or model not found (404)${suffix}`, { status });
  }
  if (status === 429) {
    return new LlmError('rate_limit', `Rate limited (429)${suffix}`, {
      status,
      retryAfterSeconds: parseRetryAfter(res.headers.get('retry-after')),
    });
  }
  if (status >= 500) {
    return new LlmError('server', `Server error (${status})${suffix}`, { status });
  }
  return new LlmError('bad_response', `Request failed (${status})${suffix}`, { status });
}

/**
 * fetch with a timeout and cooperative external cancellation. Distinguishes a
 * timeout (`timeout`) from a caller-initiated abort (`aborted`) and wraps any
 * other failure as `network`.
 */
export async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(externalSignal?.reason);

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', forwardAbort, { once: true });
  }
  const timer = setTimeout(() => {
    controller.abort(new DOMException(`Timed out after ${timeoutMs}ms`, 'TimeoutError'));
  }, timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (cause) {
    if (externalSignal?.aborted) {
      throw new LlmError('aborted', 'Request was aborted', { cause });
    }
    if (controller.signal.aborted) {
      throw new LlmError('timeout', `Request timed out after ${timeoutMs}ms`, { cause });
    }
    throw new LlmError('network', cause instanceof Error ? cause.message : 'Network error', {
      cause,
    });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
}
