import { describe, expect, it } from 'vitest';
import { parseSse } from '@/llm/sse';

/** Build a ReadableStream that emits the given string chunks verbatim. */
function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
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

async function collect(chunks: string[]): Promise<Array<{ event?: string; data: string }>> {
  const out: Array<{ event?: string; data: string }> = [];
  for await (const ev of parseSse(streamFrom(chunks))) out.push(ev);
  return out;
}

describe('parseSse', () => {
  it('parses a single data event', async () => {
    expect(await collect(['data: hello\n\n'])).toEqual([{ event: undefined, data: 'hello' }]);
  });

  it('joins multiple data lines with a newline', async () => {
    expect(await collect(['data: a\ndata: b\n\n'])).toEqual([{ event: undefined, data: 'a\nb' }]);
  });

  it('captures the event field', async () => {
    expect(await collect(['event: ping\ndata: {}\n\n'])).toEqual([{ event: 'ping', data: '{}' }]);
  });

  it('dispatches multiple events separated by blank lines', async () => {
    expect(await collect(['data: 1\n\ndata: 2\n\n'])).toEqual([
      { event: undefined, data: '1' },
      { event: undefined, data: '2' },
    ]);
  });

  it('reassembles a field split across chunk boundaries', async () => {
    expect(await collect(['data: hel', 'lo\n\n'])).toEqual([{ event: undefined, data: 'hello' }]);
  });

  it('reassembles when the field name itself is split', async () => {
    expect(await collect(['da', 'ta: x\n\n'])).toEqual([{ event: undefined, data: 'x' }]);
  });

  it('handles the blank-line terminator split across chunks', async () => {
    expect(await collect(['data: x\n', '\n'])).toEqual([{ event: undefined, data: 'x' }]);
  });

  it('handles CRLF line endings', async () => {
    expect(await collect(['data: x\r\n\r\n'])).toEqual([{ event: undefined, data: 'x' }]);
  });

  it('ignores comment lines', async () => {
    expect(await collect([': keep-alive\ndata: x\n\n'])).toEqual([{ event: undefined, data: 'x' }]);
  });

  it('tolerates a missing space after the colon', async () => {
    expect(await collect(['data:x\n\n'])).toEqual([{ event: undefined, data: 'x' }]);
  });

  it('flushes a trailing event with no final blank line', async () => {
    expect(await collect(['data: last\n'])).toEqual([{ event: undefined, data: 'last' }]);
  });

  it('passes [DONE] through as ordinary data', async () => {
    expect(await collect(['data: [DONE]\n\n'])).toEqual([{ event: undefined, data: '[DONE]' }]);
  });
});
