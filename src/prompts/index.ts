import type { PromptOverrides } from '@/storage/schema';
import { DEFAULT_TEMPLATES, DEFAULT_VERSION, type PromptKind } from './templates';

export type { PromptKind } from './templates';

export interface PromptVars {
  text: string;
  targetLang: string;
  sourceLang?: string;
  siteTitle?: string;
}

export interface RenderedPrompt {
  system: string;
  user: string;
  /** Identifies the effective template; changes when an override changes. */
  version: string;
}

/** FNV-1a → base36; stable, dependency-free, enough to key the cache. */
function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function interpolate(template: string, vars: PromptVars): string {
  const values: Record<string, string> = {
    text: vars.text,
    targetLang: vars.targetLang,
    sourceLang: vars.sourceLang ?? '',
    siteTitle: vars.siteTitle ?? '',
  };
  // Known placeholders get substituted; unknown ones are left verbatim.
  return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    name in values ? values[name] : whole,
  );
}

/**
 * Render a prompt for a feature. An override (from settings) replaces the
 * system instruction for that kind; the user template is fixed. The version is
 * 'v1' for built-ins or `custom:<hash>` so overrides invalidate cached results.
 */
export function renderPrompt(
  kind: PromptKind,
  vars: PromptVars,
  overrides: PromptOverrides = {},
): RenderedPrompt {
  const override = overrides[kind];
  const systemTemplate = override ?? DEFAULT_TEMPLATES[kind].system;
  return {
    system: interpolate(systemTemplate, vars),
    user: interpolate(DEFAULT_TEMPLATES[kind].user, vars),
    version: override ? `custom:${shortHash(override)}` : DEFAULT_VERSION,
  };
}
