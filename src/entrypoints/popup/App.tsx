import { useEffect, useState } from 'react';
import { BRAND } from '@/brand';
import { launchImageCapture } from '@/capture/launch';
import { setUiLanguage } from '@/i18n';
import { useT } from '@/i18n/useI18n';
import type { ContentMessage, PageStatusReply } from '@/messaging/protocol';
import { getSettings, updateSettings } from '@/storage';
import { PermissionBanner } from '@/ui/PermissionBanner';
import { TextTranslatePanel } from './TextTranslatePanel';

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
    return undefined;
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
  const t = useT();
  const [translated, setTranslated] = useState(false);
  const [host, setHost] = useState('');
  const [autoSite, setAutoSite] = useState(false);
  const [targetLang, setTargetLang] = useState<string | null>(null);
  const [view, setView] = useState<'menu' | 'text'>('menu');

  useEffect(() => {
    document.title = BRAND.name;
    void (async () => {
      const tab = await getActiveTab();
      const currentHost = hostOf(tab?.url);
      setHost(currentHost);

      const settings = await getSettings();
      setUiLanguage(settings.general.uiLang);
      setTargetLang(settings.general.targetLang);
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

  if (view === 'text' && targetLang !== null) {
    return (
      <main className="popup popup--text">
        <PermissionBanner />
        <TextTranslatePanel defaultTargetLang={targetLang} onBack={() => setView('menu')} />
      </main>
    );
  }

  return (
    <main className="popup">
      <PermissionBanner />
      <h1 className="popup__title">{BRAND.name}</h1>
      <p className="popup__hint">{translated ? t('popupHintTranslated') : t('popupHintDefault')}</p>
      <div className="popup__actions">
        <button
          type="button"
          className="popup__btn"
          onClick={async () => {
            await sendToActiveTab({ type: 'translate-page' });
            window.close();
          }}
        >
          {translated ? t('restoreOriginal') : t('translatePage')}
        </button>
        <button
          type="button"
          className="popup__btn"
          onClick={async () => {
            const tab = await getActiveTab();
            try {
              await launchImageCapture(tab?.id);
            } catch {
              // Even if launch fails, close the popup — the workbench/onboarding path owns the UX.
            }
            window.close();
          }}
        >
          {t('imageTranslate')}
        </button>
        <button
          type="button"
          className="popup__btn"
          // Settings load async; until then the button would open with no default language.
          disabled={targetLang === null}
          onClick={() => setView('text')}
        >
          {t('textTranslate')}
        </button>
        <button
          type="button"
          className="popup__btn popup__btn--secondary"
          onClick={() => browser.runtime.openOptionsPage()}
        >
          {t('openSettings')}
        </button>
      </div>
      {host && (
        <label className="popup__check">
          <input type="checkbox" checked={autoSite} onChange={toggleAutoSite} />
          <span>
            {t('popupAutoSite')} <b>{host}</b>
          </span>
        </label>
      )}
    </main>
  );
}
