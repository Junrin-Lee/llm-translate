import { storage } from '#imports';
import type { ResolvedProfile } from '@/llm/types';
import { migrateSettings } from './migrate';
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  resolveProfileFrom,
  type TranslateFeature,
} from './schema';

// All settings live in a single local-only item (ADR-0002). Keys are never synced.
// The stored payload may predate the current schema, so it is typed `unknown` and
// passed through migrateSettings on every read (ADR-0007).
const settingsItem = storage.defineItem<unknown>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function getSettings(): Promise<AppSettings> {
  const stored = await settingsItem.getValue();
  const migrated = migrateSettings(stored);
  // Identity, not deep equality: migrateSettings hands v2 payloads straight back,
  // so this writes exactly once per upgrade instead of on every read.
  if (migrated !== stored) await settingsItem.setValue(migrated);
  return migrated;
}

/** Shallow-merge a patch over the current settings (top-level keys replace). */
export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await settingsItem.setValue({ ...current, ...patch });
}

/** Replace the whole settings object (used by import). */
export async function replaceSettings(next: AppSettings): Promise<void> {
  await settingsItem.setValue(next);
}

export function watchSettings(cb: (settings: AppSettings) => void): () => void {
  return settingsItem.watch((next) => cb(migrateSettings(next ?? DEFAULT_SETTINGS)));
}

/**
 * Resolve the profile a feature should use: its feature override if present and
 * still resolvable (search then tries the selection override), otherwise the global
 * default. Returns null when nothing resolves.
 */
export async function resolveProfile(feature: TranslateFeature): Promise<ResolvedProfile | null> {
  return resolveProfileFrom(await getSettings(), feature);
}

// One-time privacy notice for Screenshot Translation (ADR-0006). Not part of
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
