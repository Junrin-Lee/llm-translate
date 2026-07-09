import { useEffect, useState } from 'react';
import { BRAND } from '@/brand';
import { setUiLanguage } from '@/i18n';
import { useT } from '@/i18n/useI18n';
import { hasHostAccess, requestHostAccess } from '@/permissions';
import { getSettings } from '@/storage';

export function App() {
  const t = useT();
  // null = still checking; true/false = known state.
  const [granted, setGranted] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    document.title = BRAND.name;
    void getSettings().then((s) => setUiLanguage(s.general.uiLang));
    void hasHostAccess().then(setGranted);
  }, []);

  async function grant() {
    const ok = await requestHostAccess();
    setGranted(ok);
    setDismissed(!ok);
  }

  if (granted == null) return null;
  return (
    <main className="onboarding">
      <h1 className="onboarding__title">{BRAND.name}</h1>
      {granted ? (
        <>
          <p className="onboarding__done">✓ {t('onboardingGranted')}</p>
          <p className="onboarding__hint">{t('onboardingNext')}</p>
          <button
            type="button"
            className="onboarding__btn"
            onClick={() => browser.runtime.openOptionsPage()}
          >
            {t('onboardingOpenSettings')}
          </button>
        </>
      ) : (
        <>
          <h2 className="onboarding__subtitle">{t('onboardingTitle')}</h2>
          <p className="onboarding__hint">{t('onboardingWhy')}</p>
          <button type="button" className="onboarding__btn" onClick={grant}>
            {t('onboardingGrant')}
          </button>
          {dismissed && <p className="onboarding__manual">{t('onboardingManual')}</p>}
        </>
      )}
    </main>
  );
}
