import type { Protocol } from './types';

function stripTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

/**
 * Canonicalize a user-entered Base URL.
 *
 * Trims whitespace and trailing slashes. For OpenAI-compatible endpoints,
 * appends `/v1` only when the URL has no path at all (so official APIs entered
 * as a bare origin work, while custom gateway paths like `/openai` are left
 * alone). Anthropic bases are only trimmed — `endpointFor` owns the `/v1`
 * segment there. Non-URL input is returned trimmed so callers still function.
 */
export function normalizeBaseUrl(raw: string, protocol: Protocol): string {
  const trimmed = stripTrailingSlashes(raw.trim());

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (protocol === 'openai' && (url.pathname === '' || url.pathname === '/')) {
    return `${trimmed}/v1`;
  }
  return trimmed;
}

/** Build the concrete endpoint for a (normalized) base and protocol. */
export function endpointFor(base: string, protocol: Protocol, kind: 'chat' | 'models'): string {
  const b = stripTrailingSlashes(base);

  if (protocol === 'openai') {
    return kind === 'chat' ? `${b}/chat/completions` : `${b}/models`;
  }

  // Anthropic: ensure exactly one /v1 segment.
  const withV1 = /\/v1$/.test(b) ? b : `${b}/v1`;
  return kind === 'chat' ? `${withV1}/messages` : `${withV1}/models`;
}
