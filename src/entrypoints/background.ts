import { launchImageCapture } from '@/capture/launch';
import { setUiLanguage, t } from '@/i18n';
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
import {
  focusOrOpenOnboarding,
  hasHostAccess,
  syncActionBadge,
  watchHostAccess,
} from '@/permissions';
import { getSettings, resolveProfile, watchSettings } from '@/storage';
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
      // No content script on this tab. If that's because site access was never
      // granted (Firefox MV3), route the user to onboarding; on privileged
      // pages (about:/chrome:) with access granted, stay silent as before.
      if (!(await hasHostAccess())) await focusOrOpenOnboarding();
    }
  }
}

const MENU_PAGE = 'llmt-translate-page';
const MENU_SELECTION = 'llmt-translate-selection';
const MENU_IMAGE = 'llmt-translate-image';

async function syncPageMenu(status: PageStatusReply): Promise<void> {
  const title = status === 'idle' ? t('translatePage') : t('restoreOriginal');
  try {
    await browser.contextMenus.update(MENU_PAGE, { title });
  } catch {
    // Menu not created yet — ignore.
  }
}

/** Re-title both menu items for the current locale + the active tab's state. */
async function refreshMenusForActiveTab(): Promise<void> {
  try {
    await browser.contextMenus.update(MENU_SELECTION, { title: t('translateSelection') });
  } catch {
    // ignore
  }
  try {
    await browser.contextMenus.update(MENU_IMAGE, { title: t('imageTranslate') });
  } catch {
    // ignore
  }
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const status =
      tab?.id != null
        ? ((await browser.tabs.sendMessage(tab.id, { type: 'get-page-status' })) as
            | PageStatusReply
            | undefined)
        : undefined;
    await syncPageMenu(status ?? 'idle');
  } catch {
    await syncPageMenu('idle');
  }
}

export default defineBackground(() => {
  // Toolbar "!" badge while site access is missing; live-updates on grant/revoke.
  void syncActionBadge();
  watchHostAccess(() => void syncActionBadge());

  // Apply the stored UI language on startup, then keep menus localized as it changes.
  void getSettings().then((s) => {
    setUiLanguage(s.general.uiLang);
    void refreshMenusForActiveTab();
  });
  watchSettings((s) => {
    setUiLanguage(s.general.uiLang);
    void refreshMenusForActiveTab();
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === 'translate-selection') void sendToActiveTab({ type: 'open-selection-panel' });
    else if (command === 'translate-page') void sendToActiveTab({ type: 'translate-page' });
  });

  // Right-click entries: whole page, or the current selection.
  browser.runtime.onInstalled.addListener(async (details) => {
    // First install without site access (Firefox MV3 opt-out) → onboarding page.
    if (details.reason === 'install' && !(await hasHostAccess())) {
      await focusOrOpenOnboarding();
    }
    const s = await getSettings();
    setUiLanguage(s.general.uiLang);
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({ id: MENU_PAGE, title: t('translatePage'), contexts: ['page'] });
    browser.contextMenus.create({
      id: MENU_SELECTION,
      title: t('translateSelection'),
      contexts: ['selection'],
    });
    browser.contextMenus.create({
      id: MENU_IMAGE,
      title: t('imageTranslate'),
      contexts: ['page'],
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id == null) return;
    if (info.menuItemId === MENU_IMAGE) {
      // Launch failures are surfaced by the flows themselves (onboarding/workbench).
      void launchImageCapture(tab.id).catch(() => {});
      return;
    }
    const message: ContentMessage | null =
      info.menuItemId === MENU_PAGE
        ? { type: 'translate-page' }
        : info.menuItemId === MENU_SELECTION
          ? { type: 'open-selection-panel' }
          : null;
    if (message)
      void browser.tabs.sendMessage(tab.id, message).catch(async () => {
        if (!(await hasHostAccess())) await focusOrOpenOnboarding();
      });
  });

  // Keep the page menu label in sync with the active tab's translation state.
  browser.runtime.onMessage.addListener((message: TabMessage, sender) => {
    if (message?.type === 'page-status-changed' && sender.tab?.active) {
      void syncPageMenu(message.status);
    } else if (message?.type === 'open-options') {
      void browser.tabs.create({ url: `${browser.runtime.getURL('/options.html')}#routing` });
    }
  });

  browser.tabs.onActivated.addListener(() => {
    void refreshMenusForActiveTab();
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
