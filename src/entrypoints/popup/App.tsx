import { useEffect } from 'react';
import { BRAND } from '@/brand';
import type { ContentMessage } from '@/messaging/protocol';

async function sendToActiveTab(message: ContentMessage): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) {
    try {
      await browser.tabs.sendMessage(tab.id, message);
    } catch {
      // No content script here (e.g. chrome:// page) — ignore.
    }
  }
}

export function App() {
  useEffect(() => {
    document.title = BRAND.name;
  }, []);

  return (
    <main className="popup">
      <h1 className="popup__title">{BRAND.name}</h1>
      <p className="popup__hint">
        Translate the whole page, or select text on any page for a quick translation. Click again to
        restore the original.
      </p>
      <div className="popup__actions">
        <button
          type="button"
          className="popup__btn"
          onClick={async () => {
            // Await the send before closing — closing the popup first tears down
            // this context and the message never leaves.
            await sendToActiveTab({ type: 'translate-page' });
            window.close();
          }}
        >
          Translate this page
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
