import { useState } from 'react';
import type { MessageKey } from '@/i18n/messages';
import { useT } from '@/i18n/useI18n';
import { LANGUAGES } from '@/languages';
import type { GeneralSettings, SelectionTrigger, UiLang } from '@/storage/schema';

interface Props {
  general: GeneralSettings;
  disabledSites: string[];
  onGeneral: (patch: Partial<GeneralSettings>) => void;
  onDisabledSites: (sites: string[]) => void;
}

const TRIGGERS: Array<{ value: SelectionTrigger; labelKey: MessageKey; hintKey: MessageKey }> = [
  { value: 'icon', labelKey: 'triggerIconLabel', hintKey: 'triggerIconHint' },
  { value: 'instant', labelKey: 'triggerInstantLabel', hintKey: 'triggerInstantHint' },
  { value: 'shortcut-only', labelKey: 'triggerShortcutLabel', hintKey: 'triggerShortcutHint' },
];

/** Normalize a user-typed site to a bare lowercase hostname. */
function toHostname(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

export function GeneralPanel({ general, disabledSites, onGeneral, onDisabledSites }: Props) {
  const t = useT();
  const [siteInput, setSiteInput] = useState('');

  const addSite = () => {
    const host = toHostname(siteInput);
    if (host && !disabledSites.includes(host)) onDisabledSites([...disabledSites, host]);
    setSiteInput('');
  };

  const languageOptions = LANGUAGES.some((l) => l.code === general.targetLang)
    ? LANGUAGES
    : [{ code: general.targetLang, label: general.targetLang }, ...LANGUAGES];

  return (
    <div className="defaults">
      <label className="field">
        <span className="field__label">{t('genUiLang')}</span>
        <select
          className="field__input"
          value={general.uiLang}
          onChange={(e) => onGeneral({ uiLang: e.target.value as UiLang })}
        >
          <option value="auto">{t('uiLangAuto')}</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </label>

      <label className="field">
        <span className="field__label">{t('targetLanguage')}</span>
        <select
          className="field__input"
          value={general.targetLang}
          onChange={(e) => onGeneral({ targetLang: e.target.value })}
        >
          {languageOptions.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="radios">
        <legend className="field__label">{t('genTrigger')}</legend>
        {TRIGGERS.map((tr) => (
          <label key={tr.value} className="radio">
            <input
              type="radio"
              name="selection-trigger"
              checked={general.selectionTrigger === tr.value}
              onChange={() => onGeneral({ selectionTrigger: tr.value })}
            />
            <span className="radio__body">
              <span className="radio__label">{t(tr.labelKey)}</span>
              <span className="radio__hint">{t(tr.hintKey)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="field">
        <span className="field__label">{t('genDisableSites')}</span>
        <div className="field__row">
          <input
            className="field__input mono"
            value={siteInput}
            placeholder="example.com"
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setSiteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSite();
              }
            }}
          />
          <button type="button" className="btn btn--ghost" onClick={addSite}>
            {t('actionAdd')}
          </button>
        </div>
        {disabledSites.length > 0 && (
          <ul className="sitelist">
            {disabledSites.map((site) => (
              <li key={site} className="sitelist__item">
                <span className="sitelist__host">{site}</span>
                <button
                  type="button"
                  className="btn btn--danger-ghost"
                  onClick={() => onDisabledSites(disabledSites.filter((s) => s !== site))}
                >
                  {t('actionRemove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
