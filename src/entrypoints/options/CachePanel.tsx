import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/i18n/useI18n';

const SELECTION_KEY = 'cache:selection';
const PAGE_KEY = 'cache:page';

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const sessionArea = () => browser.storage.session as unknown as StorageArea;
const localArea = () => browser.storage.local as unknown as StorageArea;

async function countEntries(area: StorageArea, key: string): Promise<number> {
  const stored = await area.get(key);
  const map = stored[key];
  return map && typeof map === 'object' ? Object.keys(map).length : 0;
}

export function CachePanel() {
  const t = useT();
  const [selection, setSelection] = useState(0);
  const [page, setPage] = useState(0);

  const refresh = useCallback(async () => {
    setSelection(await countEntries(sessionArea(), SELECTION_KEY));
    setPage(await countEntries(localArea(), PAGE_KEY));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function clear() {
    await sessionArea().set({ [SELECTION_KEY]: {} });
    await localArea().set({ [PAGE_KEY]: {} });
    void refresh();
  }

  return (
    <div className="defaults">
      <div className="field">
        <span className="field__label">{t('cacheLabel')}</span>
        <span className="field__hint">{t('cacheStats', { selection, page })}</span>
        <div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={clear}
            disabled={selection === 0 && page === 0}
          >
            {t('cacheClear')}
          </button>
        </div>
      </div>
    </div>
  );
}
