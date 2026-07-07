import { useEffect, useState } from 'react';
import { BRAND } from '@/brand';
import type { ContentMessage, PageStatusReply } from '@/messaging/protocol';
import { getSettings, updateSettings } from '@/storage';

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToActiveTab(message: ContentMessage): Promise<PageStatusReply | undefined> {
  const tab = await getActiveTab();
  if (tab?.id == null) return undefined;
  try {
    return (await browser.tabs.sendMessage(tab.id, message)) as PageStatusReply | undefined;
  } catch {
    return undefined; // No content script here (e.g. chrome:// page).
  }
}

function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function App() {
  const [translated, setTranslated] = useState(false);
  const [host, setHost] = useState('');
  const [autoSite, setAutoSite] = useState(false);

  useEffect(() => {
    document.title = BRAND.name;
    void (async () => {
      const tab = await getActiveTab();
      const currentHost = hostOf(tab?.url);
      setHost(currentHost);

      const settings = await getSettings();
      setAutoSite(currentHost !== '' && settings.siteRules.autoTranslate.includes(currentHost));

      if (tab?.id != null) {
        try {
          const status = (await browser.tabs.sendMessage(tab.id, { type: 'get-page-status' })) as
            | PageStatusReply
            | undefined;
          setTranslated(status === 'done' || status === 'translating');
        } catch {
          // ignore
        }
      }
    })();
  }, []);

  async function toggleAutoSite() {
    if (!host) return;
    const settings = await getSettings();
    const list = settings.siteRules.autoTranslate;
    const next = list.includes(host) ? list.filter((h) => h !== host) : [...list, host];
    await updateSettings({ siteRules: { ...settings.siteRules, autoTranslate: next } });
    setAutoSite(next.includes(host));
  }

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
      {host && (
        <label className="popup__check">
          <input type="checkbox" checked={autoSite} onChange={toggleAutoSite} />
          <span>
            Always translate <b>{host}</b>
          </span>
        </label>
      )}
    </main>
  );
}
