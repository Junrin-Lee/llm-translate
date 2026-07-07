import { useState } from 'react';
import { LANGUAGES } from '@/languages';
import type { GeneralSettings, SelectionTrigger } from '@/storage/schema';

interface Props {
  general: GeneralSettings;
  disabledSites: string[];
  onGeneral: (patch: Partial<GeneralSettings>) => void;
  onDisabledSites: (sites: string[]) => void;
}

const TRIGGERS: Array<{ value: SelectionTrigger; label: string; hint: string }> = [
  { value: 'icon', label: 'Show an icon', hint: 'Select text, then click the icon to translate.' },
  {
    value: 'instant',
    label: 'Translate instantly',
    hint: 'Translate as soon as you select text — uses more tokens.',
  },
  {
    value: 'shortcut-only',
    label: 'Shortcut only',
    hint: 'No icon; press the translate-selection shortcut instead.',
  },
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
        <span className="field__label">Target language</span>
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
        <legend className="field__label">Selection trigger</legend>
        {TRIGGERS.map((t) => (
          <label key={t.value} className="radio">
            <input
              type="radio"
              name="selection-trigger"
              checked={general.selectionTrigger === t.value}
              onChange={() => onGeneral({ selectionTrigger: t.value })}
            />
            <span className="radio__body">
              <span className="radio__label">{t.label}</span>
              <span className="radio__hint">{t.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="field">
        <span className="field__label">Disable the selection icon on these sites</span>
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
            Add
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
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
