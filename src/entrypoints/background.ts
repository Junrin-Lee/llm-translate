import { createClient } from '@/llm/client';
import { handleRequest } from '@/messaging/handler';
import {
  type BgEvent,
  type BgRequest,
  type ContentMessage,
  TRANSLATE_PORT,
} from '@/messaging/protocol';
import { getSettings, resolveProfile } from '@/storage';

async function sendToActiveTab(message: ContentMessage): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) {
    try {
      await browser.tabs.sendMessage(tab.id, message);
    } catch {
      // No content script on this tab (e.g. chrome:// page) — ignore.
    }
  }
}

export default defineBackground(() => {
  // Keyboard commands (declared in wxt.config manifest) route to the active tab.
  browser.commands.onCommand.addListener((command) => {
    if (command === 'translate-selection') void sendToActiveTab({ type: 'open-selection-panel' });
    else if (command === 'translate-page') void sendToActiveTab({ type: 'translate-page' });
  });

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
