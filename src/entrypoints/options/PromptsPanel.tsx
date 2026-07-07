import type { MessageKey } from '@/i18n/messages';
import { useT } from '@/i18n/useI18n';
import { DEFAULT_TEMPLATES, type PromptKind } from '@/prompts/templates';
import type { PromptOverrides } from '@/storage/schema';

interface Props {
  prompts: PromptOverrides;
  onChange: (next: PromptOverrides) => void;
}

const ENTRIES: Array<{ key: PromptKind; labelKey: MessageKey; hintKey: MessageKey }> = [
  { key: 'selectionDict', labelKey: 'promptDictLabel', hintKey: 'promptDictHint' },
  { key: 'selectionText', labelKey: 'promptTextLabel', hintKey: 'promptTextHint' },
  { key: 'pageBatch', labelKey: 'promptBatchLabel', hintKey: 'promptBatchHint' },
];

export function PromptsPanel({ prompts, onChange }: Props) {
  const t = useT();

  function update(key: PromptKind, text: string) {
    const next = { ...prompts };
    if (text.trim() === '' || text === DEFAULT_TEMPLATES[key].system) delete next[key];
    else next[key] = text;
    onChange(next);
  }

  return (
    <div className="defaults">
      {ENTRIES.map(({ key, labelKey, hintKey }) => {
        const overridden = prompts[key] !== undefined;
        const value = prompts[key] ?? DEFAULT_TEMPLATES[key].system;
        return (
          <div className="field" key={key}>
            <span className="field__label">
              {t(labelKey)}
              {overridden && <span className="badge">{t('promptCustom')}</span>}
            </span>
            <span className="field__hint">{t(hintKey)}</span>
            <textarea
              className="textarea mono"
              value={value}
              rows={5}
              spellCheck={false}
              onChange={(e) => update(key, e.target.value)}
            />
            <div className="prompt__foot">
              <span className="field__hint">{t('promptVars')}</span>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!overridden}
                onClick={() => update(key, DEFAULT_TEMPLATES[key].system)}
              >
                {t('promptReset')}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
