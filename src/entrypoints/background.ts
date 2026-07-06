import { createClient } from '@/llm/client';
import { handleRequest } from '@/messaging/handler';
import { type BgEvent, type BgRequest, TRANSLATE_PORT } from '@/messaging/protocol';
import { getSettings, resolveProfile } from '@/storage';

export default defineBackground(() => {
  // Single LLM request exit for the whole extension (ADR-0001). Content and
  // options connect a port, send one BgRequest, and receive BgEvents back.
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== TRANSLATE_PORT) return;

    const controller = new AbortController();
    port.onDisconnect.addListener(() => controller.abort());

    const emit = (event: BgEvent) => {
      try {
        port.postMessage(event);
      } catch {
        // Port already closed by the other side — nothing to do.
      }
    };

    port.onMessage.addListener((message) => {
      void handleRequest(
        message as BgRequest,
        emit,
        { getSettings, resolveProfile, createClient },
        controller.signal,
      );
    });
  });
});
