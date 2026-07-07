/** Common translation targets offered in the UI. Users can also store any
 * BCP-47 code via import; the picker prepends an unknown current value. */
export interface Language {
  code: string;
  label: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ar', label: 'العربية' },
];

export function labelForLanguage(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
