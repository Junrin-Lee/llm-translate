import { useEffect, useState } from 'react';
import { BRAND } from '@/brand';
import type { ContentMessage, PageStatusReply } from '@/messaging/protocol';

async function sendToActiveTab(message: ContentMessage): Promise<PageStatusReply | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return undefined;
  try {
    return (await browser.tabs.sendMessage(tab.id, message)) as PageStatusReply | undefined;
  } catch {
    // No content script here (e.g. chrome:// page) — ignore.
    return undefined;
  }
}

export function App() {
  const [translated, setTranslated] = useState(false);

  useEffect(() => {
    document.title = BRAND.name;
    void sendToActiveTab({ type: 'get-page-status' }).then((status) => {
      setTranslated(status === 'done' || status === 'translating');
    });
  }, []);

  return (
    <main className="popup">
      <h1 className="popup__title">{BRAND.name}</h1>
      <p className="popup__hint">
        {translated
          ? 'This page is translated. Restore the original below, or select text for a quick translation.'
          : 'Translate the whole page, or select text on any page for a quick translation.'}
      </p>
      <div className="popup__actions">
        <button
          type="button"
          className="popup__btn"
          onClick={async () => {
            await sendToActiveTab({ type: 'translate-page' });
            window.close();
          }}
        >
          {translated ? 'Restore original' : 'Translate this page'}
        </button>
        <button
          type="button"
          className="popup__btn popup__btn--secondary"
          onClick={() => browser.runtime.openOptionsPage()}
        >
          Open settings
        </button>
      </div>
    </main>
  );
}
