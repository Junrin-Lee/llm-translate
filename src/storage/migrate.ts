import type { LlmProvider, ModelParams, ModelProfile, Protocol } from '@/llm/types';
import { type AppSettings, DEFAULT_SETTINGS } from './schema';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

function toParams(value: unknown): ModelParams | undefined {
  if (!isRecord(value)) return undefined;
  const params: ModelParams = {};
  if (typeof value.temperature === 'number') params.temperature = value.temperature;
  if (typeof value.maxTokens === 'number') params.maxTokens = value.maxTokens;
  if (typeof value.timeoutMs === 'number') params.timeoutMs = value.timeoutMs;
  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * v1 -> v2. Every flat profile becomes exactly one LlmProvider plus one ModelProfile,
 * with no dedupe at all: merging two providers that share a baseUrl but not an account
 * would silently bill the wrong key, so the settings page asks the user instead
 * (ADR-0007). The ModelProfile keeps the v1 profile id, which is why `defaults` needs
 * no remapping here.
 */
function migrateV1(raw: Record<string, unknown>): AppSettings {
  const providers: LlmProvider[] = [];
  const models: ModelProfile[] = [];

  for (const entry of Array.isArray(raw.providers) ? raw.providers : []) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '') continue;
    const providerId = crypto.randomUUID();
    const name = str(entry.name);
    const protocol: Protocol = entry.protocol === 'anthropic' ? 'anthropic' : 'openai';
    providers.push({
      id: providerId,
      name,
      protocol,
      baseUrl: str(entry.baseUrl),
      apiKey: str(entry.apiKey),
    });
    const params = toParams(entry.params);
    models.push({
      id: entry.id,
      name,
      providerId,
      model: str(entry.model),
      ...(params ? { params } : {}),
    });
  }

  return {
    version: 2,
    providers,
    models,
    defaults: isRecord(raw.defaults)
      ? (raw.defaults as AppSettings['defaults'])
      : DEFAULT_SETTINGS.defaults,
    general: isRecord(raw.general)
      ? { ...DEFAULT_SETTINGS.general, ...(raw.general as Partial<AppSettings['general']>) }
      : DEFAULT_SETTINGS.general,
    siteRules: isRecord(raw.siteRules)
      ? { ...DEFAULT_SETTINGS.siteRules, ...(raw.siteRules as Partial<AppSettings['siteRules']>) }
      : DEFAULT_SETTINGS.siteRules,
    prompts: isRecord(raw.prompts) ? (raw.prompts as AppSettings['prompts']) : {},
  };
}

/**
 * Bring any stored or imported payload up to v2. Returns the input **by identity**
 * when it is already v2, so callers can skip a pointless storage write.
 * Shape validation is not this function's job: `normalizeSettings` does that for
 * untrusted files, and stored data was written by a previous version of this app.
 */
export function migrateSettings(raw: unknown): AppSettings {
  if (!isRecord(raw)) return DEFAULT_SETTINGS;
  if (raw.version === 2) return raw as unknown as AppSettings;
  return migrateV1(raw);
}
