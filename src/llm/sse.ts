export interface SseEvent {
  event?: string;
  data: string;
}

/**
 * Parse a Server-Sent Events byte stream into events.
 *
 * Follows the WHATWG event-stream rules that matter for LLM APIs: fields are
 * `name: value` (one optional leading space stripped), multiple `data:` lines
 * join with `\n`, an event dispatches on a blank line, `:` lines are comments,
 * and CRLF is tolerated. `[DONE]` is not special — it surfaces as data and the
 * adapter decides what it means. A trailing event with no final blank line is
 * flushed at end-of-stream (lenient toward servers that omit it).
 */
export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventType: string | undefined;
  let dataLines: string[] = [];

  function takeEvent(): SseEvent | undefined {
    const event =
      dataLines.length > 0 ? { event: eventType, data: dataLines.join('\n') } : undefined;
    eventType = undefined;
    dataLines = [];
    return event;
  }

  function consumeLine(rawLine: string): SseEvent | undefined {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') return takeEvent();
    if (line.startsWith(':')) return undefined; // comment

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'data') dataLines.push(value);
    else if (field === 'event') eventType = value;
    return undefined;
  }

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        const event = consumeLine(line);
        if (event) yield event;
        newlineIdx = buffer.indexOf('\n');
      }
    }

    // End of stream: process a final line without a trailing newline, then flush.
    if (buffer !== '') {
      const event = consumeLine(buffer);
      if (event) yield event;
    }
    const trailing = takeEvent();
    if (trailing) yield trailing;
  } finally {
    reader.releaseLock();
  }
}
