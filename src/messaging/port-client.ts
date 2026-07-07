import { type BgEvent, type BgRequest, TRANSLATE_PORT } from './protocol';

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
