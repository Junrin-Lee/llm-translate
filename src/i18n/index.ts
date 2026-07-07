import type { UiLang } from '@/storage/schema';
import { MESSAGES, type MessageKey } from './messages';

type Locale = 'en' | 'zh';

function detectBrowserLocale(): Locale {
  let lang = 'en';
  try {
    lang = browser.i18n.getUILanguage();
  } catch {
    lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
  }
  return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let locale: Locale = detectBrowserLocale();
const listeners = new Set<() => void>();

export function resolveLocale(setting: UiLang): Locale {
  return setting === 'en' || setting === 'zh' ? setting : detectBrowserLocale();
}

export function getLocale(): Locale {
  return locale;
}

/** Apply the UI language setting ('auto' resolves to the browser locale). */
export function setUiLanguage(setting: UiLang): void {
  const next = resolveLocale(setting);
  if (next === locale) return;
  locale = next;
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Translate a key, replacing {name} placeholders from subs. */
export function t(key: MessageKey, subs?: Record<string, string | number>): string {
  let message: string = MESSAGES[locale][key] ?? MESSAGES.en[key];
  if (subs) {
    for (const [name, value] of Object.entries(subs)) {
      message = message.replace(`{${name}}`, String(value));
    }
  }
  return message;
}
