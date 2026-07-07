import type { TokenUsage } from '@/llm/types';
import { type BgEvent, type BgRequest, TRANSLATE_PORT } from './protocol';

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: (usage?: TokenUsage) => void;
  onError: (message: string) => void;
}

/**
 * Open a streaming translation over a port. Deltas arrive via onDelta; the
 * stream ends with onDone or onError. Call the returned cancel() to abort
 * (disconnecting the port aborts the in-flight request in the background).
 */
export function openTranslateStream(
  request: BgRequest,
  handlers: StreamHandlers,
): { cancel: () => void } {
  const port = browser.runtime.connect({ name: TRANSLATE_PORT });
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      port.disconnect();
    } catch {
      // already gone
    }
  };

  port.onMessage.addListener((message) => {
    const event = message as BgEvent;
    if (event.type === 'delta') handlers.onDelta(event.text);
    else if (event.type === 'done') {
      handlers.onDone(event.usage);
      close();
    } else if (event.type === 'error') {
      handlers.onError(event.message);
      close();
    }
  });
  port.onDisconnect.addListener(() => {
    if (!closed) {
      closed = true;
      handlers.onError('Connection closed before the translation finished');
    }
  });
  port.postMessage(request);

  return {
    cancel: close,
  };
}

/**
 * Send a one-shot request to the background and resolve with its single
 * terminal event (used by list-models / test-connection, which emit exactly
 * one event). Streaming requests use openTranslatePort instead (added in M2).
 */
export function runRpc(request: BgRequest, timeoutMs = 65_000): Promise<BgEvent> {
  return new Promise((resolve, reject) => {
    const port = browser.runtime.connect({ name: TRANSLATE_PORT });
    let settled = false;

    const settle = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        port.disconnect();
      } catch {
        // already gone
      }
      run();
    };

    const timer = setTimeout(() => settle(() => reject(new Error('Request timed out'))), timeoutMs);

    port.onMessage.addListener((message) => settle(() => resolve(message as BgEvent)));
    port.onDisconnect.addListener(() =>
      settle(() => reject(new Error('Background disconnected before responding'))),
    );
    port.postMessage(request);
  });
}
