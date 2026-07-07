import { DEFAULT_TEMPLATES, type PromptKind } from '@/prompts/templates';
import type { PromptOverrides } from '@/storage/schema';

interface Props {
  prompts: PromptOverrides;
  onChange: (next: PromptOverrides) => void;
}

const ENTRIES: Array<{ key: PromptKind; label: string; hint: string }> = [
  {
    key: 'selectionDict',
    label: 'Dictionary lookup',
    hint: 'Selection popup, for single words or short phrases (JSON dictionary output).',
  },
  {
    key: 'selectionText',
    label: 'Selection translation',
    hint: 'Selection popup, for sentences and longer text.',
  },
  {
    key: 'pageBatch',
    label: 'Full-page translation',
    hint: 'Batched page segments — the prompt must keep every @@n@@ marker.',
  },
];

export function PromptsPanel({ prompts, onChange }: Props) {
  function update(key: PromptKind, text: string) {
    const next = { ...prompts };
    // Empty or identical-to-default means "use the built-in prompt".
    if (text.trim() === '' || text === DEFAULT_TEMPLATES[key].system) delete next[key];
    else next[key] = text;
    onChange(next);
  }

  return (
    <div className="defaults">
      {ENTRIES.map(({ key, label, hint }) => {
        const overridden = prompts[key] !== undefined;
        const value = prompts[key] ?? DEFAULT_TEMPLATES[key].system;
        return (
          <div className="field" key={key}>
            <span className="field__label">
              {label}
              {overridden && <span className="badge">Custom</span>}
            </span>
            <span className="field__hint">{hint}</span>
            <textarea
              className="textarea mono"
              value={value}
              rows={5}
              spellCheck={false}
              onChange={(e) => update(key, e.target.value)}
            />
            <div className="prompt__foot">
              <span className="field__hint">{'Variables: {{text}}, {{targetLang}}'}</span>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!overridden}
                onClick={() => update(key, DEFAULT_TEMPLATES[key].system)}
              >
                Reset to default
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
