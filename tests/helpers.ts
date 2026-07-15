/** Shared test utilities for the LLM adapter suites. */

export interface FetchCall {
  url: string;
  init: RequestInit;
}

/** Build a ReadableStream that emits the given string chunks verbatim. */
export function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i] ?? ''));
        i += 1;
      } else {
        controller.close();
      }
    },
  });
}

/** A fetch stand-in that records calls and delegates to a responder. */
export function recordingFetch(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>,
): ((url: string, init?: RequestInit) => Promise<Response>) & { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  return Object.assign(fn, { calls });
}

/** A body stream that never emits and never closes — a stalled connection. */
export function neverClosingBody(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start() {
      // Never enqueue, never close.
    },
  });
}

/** A fetch stand-in that never resolves until its signal aborts, then rejects. */
export function hangingFetch(): (url: string, init?: RequestInit) => Promise<Response> {
  return (_url: string, init: RequestInit = {}) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init.signal;
      if (signal) {
        signal.addEventListener(
          'abort',
          () => reject(signal.reason ?? new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      }
    });
}

export function sseResponse(chunks: string[], status = 200): Response {
  return new Response(streamFrom(chunks), {
    status,
    headers: { 'content-type': 'text/event-stream' },
  });
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Parse the JSON request body captured on a FetchCall. */
export function bodyOf(call: FetchCall): Record<string, unknown> {
  return JSON.parse(call.init.body as string);
}

/** Read a header value from a captured RequestInit (headers as plain object). */
export function headerOf(call: FetchCall, name: string): string | undefined {
  const headers = call.init.headers as Record<string, string> | undefined;
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}
