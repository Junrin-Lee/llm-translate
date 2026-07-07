import { useSyncExternalStore } from 'react';
import { getLocale, subscribeLocale, t } from './index';

/** Returns the translate function and re-renders the component on locale change. */
export function useT() {
  useSyncExternalStore(subscribeLocale, getLocale);
  return t;
}
