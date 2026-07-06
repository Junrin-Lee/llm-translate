import { storage } from '#imports';
import type { ProviderProfile } from '@/llm/types';
import { type AppSettings, DEFAULT_SETTINGS } from './schema';

// All settings live in a single local-only item (ADR-0002). Keys are never synced.
const settingsItem = storage.defineItem<AppSettings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export function getSettings(): Promise<AppSettings> {
  return settingsItem.getValue();
}

/** Shallow-merge a patch over the current settings (top-level keys replace). */
export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await settingsItem.getValue();
  await settingsItem.setValue({ ...current, ...patch });
}

/** Replace the whole settings object (used by import). */
export async function replaceSettings(next: AppSettings): Promise<void> {
  await settingsItem.setValue(next);
}

export function watchSettings(cb: (settings: AppSettings) => void): () => void {
  return settingsItem.watch((next) => cb(next ?? DEFAULT_SETTINGS));
}

/**
 * Resolve the profile a feature should use: its feature override if present and
 * still valid, otherwise the global default. Returns null when neither resolves.
 */
export async function resolveProfile(
  feature: 'selection' | 'page',
): Promise<ProviderProfile | null> {
  const settings = await getSettings();
  const override = feature === 'selection' ? settings.defaults.selection : settings.defaults.page;
  for (const id of [override, settings.defaults.global]) {
    if (!id) continue;
    const found = settings.providers.find((profile) => profile.id === id);
    if (found) return found;
  }
  return null;
}
