import type { ProviderProfile } from '@/llm/types';

export type SelectionTrigger = 'icon' | 'instant' | 'shortcut-only';
export type PageMode = 'bilingual' | 'replace';

export interface GeneralSettings {
  /** BCP-47 target language, e.g. 'zh-CN'. */
  targetLang: string;
  /** Optional secondary target offered in the selection panel. */
  secondaryTargetLang?: string;
  selectionTrigger: SelectionTrigger;
  pageMode: PageMode;
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
}

/** Which saved profile each feature resolves to; features fall back to global. */
export interface ProfileDefaults {
  global: string | null;
  selection?: string;
  page?: string;
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
  },
  siteRules: { autoTranslate: [], disableSelection: [] },
  prompts: {},
};
