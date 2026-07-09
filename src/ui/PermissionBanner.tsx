import { useEffect, useState } from 'react';
import { useT } from '@/i18n/useI18n';
import { hasHostAccess, requestHostAccess, watchHostAccess } from '@/permissions';
import './permission-banner.css';

/** Warns when site access is missing (Firefox MV3 treats it as optional — ADR-0005). */
export function PermissionBanner() {
  const t = useT();
  // Start optimistic so Chrome (always granted) never flashes the banner.
  const [granted, setGranted] = useState(true);

  useEffect(() => {
    void hasHostAccess().then(setGranted);
    return watchHostAccess(setGranted);
  }, []);

  if (granted) return null;
  return (
    <div className="perm-banner" role="alert">
      <span className="perm-banner__text">{t('permBannerText')}</span>
      <button
        type="button"
        className="perm-banner__btn"
        onClick={async () => setGranted(await requestHostAccess())}
      >
        {t('permBannerAction')}
      </button>
    </div>
  );
}
