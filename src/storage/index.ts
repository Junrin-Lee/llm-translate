import { storage } from '#imports';
import type { ProviderProfile } from '@/llm/types';
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  resolveProfileFrom,
  type TranslateFeature,
} from './schema';

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
export async function resolveProfile(feature: TranslateFeature): Promise<ProviderProfile | null> {
  return resolveProfileFrom(await getSettings(), feature);
}

// One-time privacy notice for Image Translation (ADR-0006). Not part of
// AppSettings: it's a UI acknowledgement, not a user preference.
const imageNoticeItem = storage.defineItem<boolean>('local:imageNoticeSeen', {
  fallback: false,
});

export function getImageNoticeSeen(): Promise<boolean> {
  return imageNoticeItem.getValue();
}

export function setImageNoticeSeen(): Promise<void> {
  return imageNoticeItem.setValue(true);
}
