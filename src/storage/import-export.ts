import type { LlmProvider, ModelParams, ModelProfile, Protocol } from '@/llm/types';
import { replaceSettings } from './index';
import { isRecord, migrateSettings } from './migrate';
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  type PageMode,
  pruneDefaults,
  type SelectionTrigger,
  TRANSLATE_FEATURES,
  type UiLang,
} from './schema';

/** Serialize settings to pretty JSON; API keys are stripped unless requested. */
export function exportSettings(settings: AppSettings, includeKeys: boolean): string {
  const providers = includeKeys
    ? settings.providers
    : settings.providers.map((provider) => ({ ...provider, apiKey: '' }));
  return JSON.stringify({ ...settings, providers }, null, 2);
}

/** Parse, validate and persist settings from an imported JSON string. */
export async function importSettings(json: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON: could not parse the settings file');
  }
  await replaceSettings(normalizeSettings(parsed));
}

const PROTOCOLS: readonly Protocol[] = ['openai', 'anthropic'];
const SELECTION_TRIGGERS: readonly SelectionTrigger[] = ['icon', 'instant', 'shortcut-only'];
const PAGE_MODES: readonly PageMode[] = ['bilingual', 'replace'];
const UI_LANGS: readonly UiLang[] = ['auto', 'en', 'zh'];

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function requireStrings(
  value: Record<string, unknown>,
  keys: readonly string[],
  what: string,
): void {
  for (const key of keys) {
    if (typeof value[key] !== 'string' || (value[key] as string).length === 0) {
      throw new Error(`${what} field "${key}" must be a non-empty string`);
    }
  }
}

function normalizeProvider(value: unknown): LlmProvider {
  if (!isRecord(value)) throw new Error('Each provider must be an object');
  const { protocol } = value;
  if (typeof protocol !== 'string' || !PROTOCOLS.includes(protocol as Protocol)) {
    throw new Error(`Invalid provider protocol: ${String(protocol)}`);
  }
  requireStrings(value, ['id', 'baseUrl'], 'Provider');

  const provider: LlmProvider = {
    id: value.id as string,
    name: typeof value.name === 'string' ? value.name : '',
    protocol: protocol as Protocol,
    baseUrl: value.baseUrl as string,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
  };
  if (typeof value.timeoutMs === 'number') provider.timeoutMs = value.timeoutMs;
  return provider;
}

function normalizeModel(value: unknown, providerIds: ReadonlySet<string>): ModelProfile {
  if (!isRecord(value)) throw new Error('Each model must be an object');
  requireStrings(value, ['id', 'providerId', 'model'], 'Model');
  if (!providerIds.has(value.providerId as string)) {
    throw new Error(`Model "${value.id}" references a provider that is not in this file`);
  }

  const profile: ModelProfile = {
    id: value.id as string,
    name: typeof value.name === 'string' ? value.name : '',
    providerId: value.providerId as string,
    model: value.model as string,
  };
  if (isRecord(value.params)) {
    const params: ModelParams = {};
    if (typeof value.params.temperature === 'number') params.temperature = value.params.temperature;
    if (typeof value.params.maxTokens === 'number') params.maxTokens = value.params.maxTokens;
    if (typeof value.params.timeoutMs === 'number') params.timeoutMs = value.params.timeoutMs;
    if (Object.keys(params).length > 0) profile.params = params;
  }
  return profile;
}

/** Validate untrusted imported data and fold it over the defaults. */
export function normalizeSettings(parsed: unknown): AppSettings {
  if (!isRecord(parsed)) throw new Error('Settings must be an object');
  // An older export is a v1 payload: lift it to the v2 shape first, then validate.
  const source: Record<string, unknown> =
    parsed.version === 2 ? parsed : (migrateSettings(parsed) as unknown as Record<string, unknown>);

  const providers = Array.isArray(source.providers) ? source.providers.map(normalizeProvider) : [];
  const providerIds = new Set(providers.map((p) => p.id));
  const models = Array.isArray(source.models)
    ? source.models.map((m) => normalizeModel(m, providerIds))
    : [];

  const defaultsRaw = isRecord(source.defaults) ? source.defaults : {};
  const defaults: AppSettings['defaults'] = {
    global: typeof defaultsRaw.global === 'string' ? defaultsRaw.global : null,
  };
  for (const feature of TRANSLATE_FEATURES) {
    if (typeof defaultsRaw[feature] === 'string') defaults[feature] = defaultsRaw[feature];
  }

  const generalRaw = isRecord(source.general) ? source.general : {};
  const general: AppSettings['general'] = {
    targetLang:
      typeof generalRaw.targetLang === 'string'
        ? generalRaw.targetLang
        : DEFAULT_SETTINGS.general.targetLang,
    selectionTrigger: SELECTION_TRIGGERS.includes(generalRaw.selectionTrigger as SelectionTrigger)
      ? (generalRaw.selectionTrigger as SelectionTrigger)
      : DEFAULT_SETTINGS.general.selectionTrigger,
    pageMode: PAGE_MODES.includes(generalRaw.pageMode as PageMode)
      ? (generalRaw.pageMode as PageMode)
      : DEFAULT_SETTINGS.general.pageMode,
    uiLang: UI_LANGS.includes(generalRaw.uiLang as UiLang)
      ? (generalRaw.uiLang as UiLang)
      : DEFAULT_SETTINGS.general.uiLang,
  };
  if (typeof generalRaw.secondaryTargetLang === 'string') {
    general.secondaryTargetLang = generalRaw.secondaryTargetLang;
  }

  const siteRaw = isRecord(source.siteRules) ? source.siteRules : {};
  const siteRules: AppSettings['siteRules'] = {
    autoTranslate: toStringArray(siteRaw.autoTranslate),
    disableSelection: toStringArray(siteRaw.disableSelection),
  };

  const promptsRaw = isRecord(source.prompts) ? source.prompts : {};
  const prompts: AppSettings['prompts'] = {};
  for (const key of ['selectionDict', 'selectionText', 'pageBatch', 'imageText'] as const) {
    if (typeof promptsRaw[key] === 'string') prompts[key] = promptsRaw[key] as string;
  }

  return {
    version: 2,
    providers,
    models,
    // Anything pointing at a model this file does not contain is dropped, so an
    // imported file can never leave routing half-broken.
    defaults: pruneDefaults(defaults, models),
    general,
    siteRules,
    prompts,
  };
}
