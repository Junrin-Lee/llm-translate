import { createClient } from '@/llm/client';
import { handleRequest } from '@/messaging/handler';
import {
  type BgEvent,
  type BgRequest,
  type ContentMessage,
  type PageStatusReply,
  type TabMessage,
  TRANSLATE_PORT,
} from '@/messaging/protocol';
import { getSettings, resolveProfile } from '@/storage';
import { createCache, type StorageAreaLike } from '@/translator/cache';

// Selection cache is in-memory (cleared on browser close, never hits disk);
// page cache persists across sessions. Both keyed by content, LRU-evicted.
const selectionCache = createCache(browser.storage.session as unknown as StorageAreaLike, {
  storageKey: 'cache:selection',
  maxEntries: 500,
});
const pageCache = createCache(browser.storage.local as unknown as StorageAreaLike, {
  storageKey: 'cache:page',
  maxEntries: 1000,
});

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

const MENU_PAGE = 'llmt-translate-page';
const MENU_SELECTION = 'llmt-translate-selection';

async function syncPageMenu(status: PageStatusReply): Promise<void> {
  const title = status === 'idle' ? 'Translate this page' : 'Restore original';
  try {
    await browser.contextMenus.update(MENU_PAGE, { title });
  } catch {
    // Menu not created yet — ignore.
  }
}

export default defineBackground(() => {
  // Keyboard commands (declared in wxt.config manifest) route to the active tab.
  browser.commands.onCommand.addListener((command) => {
    if (command === 'translate-selection') void sendToActiveTab({ type: 'open-selection-panel' });
    else if (command === 'translate-page') void sendToActiveTab({ type: 'translate-page' });
  });

  // Right-click entries: whole page, or the current selection.
  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: MENU_PAGE,
      title: 'Translate this page',
      contexts: ['page'],
    });
    browser.contextMenus.create({
      id: MENU_SELECTION,
      title: 'Translate selection',
      contexts: ['selection'],
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id == null) return;
    const message: ContentMessage | null =
      info.menuItemId === MENU_PAGE
        ? { type: 'translate-page' }
        : info.menuItemId === MENU_SELECTION
          ? { type: 'open-selection-panel' }
          : null;
    if (message) void browser.tabs.sendMessage(tab.id, message).catch(() => {});
  });

  // Keep the "Translate this page" / "Restore original" label in sync with the
  // active tab's translation state.
  browser.runtime.onMessage.addListener((message: TabMessage, sender) => {
    if (message?.type === 'page-status-changed' && sender.tab?.active) {
      void syncPageMenu(message.status);
    }
  });

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const status = (await browser.tabs.sendMessage(tabId, { type: 'get-page-status' })) as
        | PageStatusReply
        | undefined;
      await syncPageMenu(status ?? 'idle');
    } catch {
      await syncPageMenu('idle');
    }
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
        { getSettings, resolveProfile, createClient, selectionCache, pageCache },
        controller.signal,
      );
    });
  });
});
