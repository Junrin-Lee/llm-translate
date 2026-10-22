import type { LlmProvider, ModelParams, ModelProfile, ResolvedProfile } from '@/llm/types';

export type SelectionTrigger = 'icon' | 'instant' | 'shortcut-only';
export type PageMode = 'bilingual' | 'replace';
/** UI language: auto follows the browser, or force English / Chinese. */
export type UiLang = 'auto' | 'en' | 'zh';

/** Features that route to a Model Profile. */
export type TranslateFeature = 'selection' | 'page' | 'image' | 'search';

/** Every routable feature, in one place so nothing gets forgotten again. */
export const TRANSLATE_FEATURES = [
  'selection',
  'page',
  'image',
  'search',
] as const satisfies readonly TranslateFeature[];

/** A feature that falls back to another feature's override before the global default. */
const FEATURE_FALLBACK: Partial<Record<TranslateFeature, TranslateFeature>> = {
  search: 'selection',
};

export interface GeneralSettings {
  /** BCP-47 target language, e.g. 'zh-CN'. */
  targetLang: string;
  /** Reserved: an optional secondary target language; not yet wired to any UI. */
  secondaryTargetLang?: string;
  selectionTrigger: SelectionTrigger;
  pageMode: PageMode;
  /** Language of the extension's own UI. */
  uiLang: UiLang;
  /** Show a search icon next to the selection icon; unset means off. */
  selectionSearch?: boolean;
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
  selectionSearch?: string;
  pageBatch?: string;
  imageText?: string;
}

/** Which saved Model Profile each feature resolves to; features fall back to global. */
export interface ProfileDefaults {
  global: string | null;
  selection?: string;
  page?: string;
  image?: string;
  /** Unset falls back to the selection override, then global. */
  search?: string;
}

export interface AppSettings {
  version: 2;
  providers: LlmProvider[];
  models: ModelProfile[];
  /** Ids in here are ModelProfile ids, never LlmProvider ids (ADR-0007). */
  defaults: ProfileDefaults;
  general: GeneralSettings;
  siteRules: SiteRules;
  prompts: PromptOverrides;
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 2,
  providers: [],
  models: [],
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

/** Flatten a provider and a model into the shape the adapters take. */
export function joinProfile(provider: LlmProvider, model: ModelProfile): ResolvedProfile {
  const params: ModelParams = { ...model.params };
  if (params.timeoutMs === undefined && provider.timeoutMs !== undefined) {
    params.timeoutMs = provider.timeoutMs;
  }
  const resolved: ResolvedProfile = {
    id: model.id,
    name: model.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: model.model,
  };
  if (Object.keys(params).length > 0) resolved.params = params;
  return resolved;
}

/** A model-less stand-in used for provider probes; listModels ignores `model`. */
export function resolveForProvider(provider: LlmProvider): ResolvedProfile {
  const resolved: ResolvedProfile = {
    id: provider.id,
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: '',
  };
  if (provider.timeoutMs !== undefined) resolved.params = { timeoutMs: provider.timeoutMs };
  return resolved;
}

/**
 * Pure resolution: the feature override if present and still resolvable, then the
 * override of the feature it falls back to (search → selection), otherwise the
 * global default. A model whose provider has gone missing is skipped rather than
 * returned half-built. storage/index.ts wraps this with live settings.
 */
export function resolveProfileFrom(
  settings: AppSettings,
  feature: TranslateFeature,
): ResolvedProfile | null {
  const fallback = FEATURE_FALLBACK[feature];
  const chain = [
    settings.defaults[feature],
    fallback && settings.defaults[fallback],
    settings.defaults.global,
  ];
  for (const id of chain) {
    if (!id) continue;
    const model = settings.models.find((m) => m.id === id);
    if (!model) continue;
    const provider = settings.providers.find((p) => p.id === model.providerId);
    if (!provider) continue;
    return joinProfile(provider, model);
  }
  return null;
}

/** Drop every pointer that no longer names a live model; null out a dead global. */
export function pruneDefaults(defaults: ProfileDefaults, models: ModelProfile[]): ProfileDefaults {
  const alive = (id: string | null | undefined): id is string =>
    !!id && models.some((m) => m.id === id);
  const next: ProfileDefaults = { global: alive(defaults.global) ? defaults.global : null };
  for (const feature of TRANSLATE_FEATURES) {
    if (alive(defaults[feature])) next[feature] = defaults[feature];
  }
  return next;
}

/**
 * Two providers are the same connection only when protocol, baseUrl and apiKey all
 * match. Anything looser could route two accounts through one key (ADR-0007).
 */
const providerKey = (p: LlmProvider) => JSON.stringify([p.protocol, p.baseUrl, p.apiKey]);

/** How many provider rows would disappear if identical ones were merged. */
export function countMergeableProviders(providers: LlmProvider[]): number {
  return providers.length - new Set(providers.map(providerKey)).size;
}

/**
 * Keep the first provider of each identical group and repoint every model at it.
 * Returns the same object when nothing merges, so callers can skip a write.
 * A differing `timeoutMs` is not part of the key: the kept provider's value wins.
 */
export function mergeDuplicateProviders(settings: AppSettings): AppSettings {
  const keptByKey = new Map<string, string>();
  const remap = new Map<string, string>();
  const providers: LlmProvider[] = [];
  for (const provider of settings.providers) {
    const key = providerKey(provider);
    const kept = keptByKey.get(key);
    if (kept) {
      remap.set(provider.id, kept);
      continue;
    }
    keptByKey.set(key, provider.id);
    providers.push(provider);
  }
  if (remap.size === 0) return settings;
  const models = settings.models.map((m) => {
    const kept = remap.get(m.providerId);
    return kept ? { ...m, providerId: kept } : m;
  });
  return { ...settings, providers, models };
}
