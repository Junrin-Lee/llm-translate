import { useCallback, useEffect, useState } from 'react';
import { getSettings, replaceSettings } from '@/storage';
import type { AppSettings } from '@/storage/schema';

/**
 * Load settings once and expose an optimistic mutate helper: state updates
 * synchronously for a responsive UI while the change is persisted to
 * storage.local. Returns null while the initial load is in flight.
 */
export function useSettings(): {
  settings: AppSettings | null;
  mutate: (updater: (prev: AppSettings) => AppSettings) => void;
} {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let alive = true;
    getSettings().then((loaded) => {
      if (alive) setSettings(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  const mutate = useCallback((updater: (prev: AppSettings) => AppSettings) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      void replaceSettings(next);
      return next;
    });
  }, []);

  return { settings, mutate };
}
