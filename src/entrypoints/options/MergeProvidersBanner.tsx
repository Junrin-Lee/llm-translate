import { useT } from '@/i18n/useI18n';

interface Props {
  /** How many provider rows would disappear; the banner hides itself at zero. */
  count: number;
  onMerge: () => void;
}

/**
 * Offers to collapse providers that match exactly on protocol, Base URL and API
 * key. Merging is never automatic (ADR-0007), and there is no "dismissed" flag to
 * keep: the count is derived from the data, so acting on it makes this disappear
 * and a new duplicate brings it back.
 */
export function MergeProvidersBanner({ count, onMerge }: Props) {
  const t = useT();
  if (count === 0) return null;
  return (
    <div className="merge-banner" role="status">
      <span className="merge-banner__text">{t('mergeBannerText', { count })}</span>
      <button type="button" className="btn btn--primary" onClick={onMerge}>
        {t('mergeBannerAction')}
      </button>
    </div>
  );
}
