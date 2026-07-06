import type { Protocol, ProviderProfile } from '@/llm/types';
import { replaceSettings } from './index';
import { type AppSettings, DEFAULT_SETTINGS, type PageMode, type SelectionTrigger } from './schema';

/** Serialize settings to pretty JSON; API keys are stripped unless requested. */
export function exportSettings(settings: AppSettings, includeKeys: boolean): string {
  const providers = includeKeys
    ? settings.providers
    : settings.providers.map((profile) => ({ ...profile, apiKey: '' }));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function normalizeProfile(value: unknown): ProviderProfile {
  if (!isRecord(value)) throw new Error('Each provider must be an object');
  const { protocol } = value;
  if (typeof protocol !== 'string' || !PROTOCOLS.includes(protocol as Protocol)) {
    throw new Error(`Invalid provider protocol: ${String(protocol)}`);
  }
  for (const key of ['id', 'name', 'baseUrl', 'model'] as const) {
    if (typeof value[key] !== 'string' || (value[key] as string).length === 0) {
      throw new Error(`Provider field "${key}" must be a non-empty string`);
    }
  }

  const profile: ProviderProfile = {
    id: value.id as string,
    name: value.name as string,
    protocol: protocol as Protocol,
    baseUrl: value.baseUrl as string,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
    model: value.model as string,
  };

  if (isRecord(value.params)) {
    const params: NonNullable<ProviderProfile['params']> = {};
    if (typeof value.params.temperature === 'number') params.temperature = value.params.temperature;
    if (typeof value.params.maxTokens === 'number') params.maxTokens = value.params.maxTokens;
    if (typeof value.params.timeoutMs === 'number') params.timeoutMs = value.params.timeoutMs;
    profile.params = params;
  }
  return profile;
}

/** Validate untrusted imported data and fold it over the defaults. */
export function normalizeSettings(parsed: unknown): AppSettings {
  if (!isRecord(parsed)) throw new Error('Settings must be an object');

  const providers = Array.isArray(parsed.providers) ? parsed.providers.map(normalizeProfile) : [];

  const defaultsRaw = isRecord(parsed.defaults) ? parsed.defaults : {};
  const defaults: AppSettings['defaults'] = {
    global: typeof defaultsRaw.global === 'string' ? defaultsRaw.global : null,
  };
  if (typeof defaultsRaw.selection === 'string') defaults.selection = defaultsRaw.selection;
  if (typeof defaultsRaw.page === 'string') defaults.page = defaultsRaw.page;

  const generalRaw = isRecord(parsed.general) ? parsed.general : {};
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
  };
  if (typeof generalRaw.secondaryTargetLang === 'string') {
    general.secondaryTargetLang = generalRaw.secondaryTargetLang;
  }

  const siteRaw = isRecord(parsed.siteRules) ? parsed.siteRules : {};
  const siteRules: AppSettings['siteRules'] = {
    autoTranslate: toStringArray(siteRaw.autoTranslate),
    disableSelection: toStringArray(siteRaw.disableSelection),
  };

  const promptsRaw = isRecord(parsed.prompts) ? parsed.prompts : {};
  const prompts: AppSettings['prompts'] = {};
  for (const key of ['selectionDict', 'selectionText', 'pageBatch'] as const) {
    if (typeof promptsRaw[key] === 'string') prompts[key] = promptsRaw[key] as string;
  }

  return { version: 1, providers, defaults, general, siteRules, prompts };
}
