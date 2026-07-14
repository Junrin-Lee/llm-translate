import type { ProviderProfile } from '@/llm/types';

export type SelectionTrigger = 'icon' | 'instant' | 'shortcut-only';
export type PageMode = 'bilingual' | 'replace';
/** UI language: auto follows the browser, or force English / Chinese. */
export type UiLang = 'auto' | 'en' | 'zh';

/** Features that route to a Provider Profile. */
export type TranslateFeature = 'selection' | 'page' | 'image';

export interface GeneralSettings {
  /** BCP-47 target language, e.g. 'zh-CN'. */
  targetLang: string;
  /** Reserved: an optional secondary target language; not yet wired to any UI. */
  secondaryTargetLang?: string;
  selectionTrigger: SelectionTrigger;
  pageMode: PageMode;
  /** Language of the extension's own UI. */
  uiLang: UiLang;
}

export interface SiteRules {
  /** Domains that auto-translate on load. */
  autoTranslate: string[];
  /** Domains where the selection icon is suppressed. */
  disableSelection: string[];
}

export interface PromptOverrides {
  selectionDict?: string;
  selectionText?: string;
  pageBatch?: string;
  imageText?: string;
}

/** Which saved profile each feature resolves to; features fall back to global. */
export interface ProfileDefaults {
  global: string | null;
  selection?: string;
  page?: string;
  image?: string;
}

export interface AppSettings {
  version: 1;
  providers: ProviderProfile[];
  defaults: ProfileDefaults;
  general: GeneralSettings;
  siteRules: SiteRules;
  prompts: PromptOverrides;
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  providers: [],
  defaults: { global: null },
  general: {
    targetLang: 'zh-CN',
    selectionTrigger: 'icon',
    pageMode: 'bilingual',
    uiLang: 'auto',
  },
  siteRules: { autoTranslate: [], disableSelection: [] },
  prompts: {},
};

/**
 * Pure resolution: the feature override if present and still valid, otherwise
 * the global default. storage/index.ts wraps this with live settings.
 */
export function resolveProfileFrom(
  settings: AppSettings,
  feature: TranslateFeature,
): ProviderProfile | null {
  const override = settings.defaults[feature];
  for (const id of [override, settings.defaults.global]) {
    if (!id) continue;
    const found = settings.providers.find((profile) => profile.id === id);
    if (found) return found;
  }
  return null;
}
