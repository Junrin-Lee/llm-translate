import type { ProviderProfile } from '@/llm/types';
import type { ProfileDefaults } from '@/storage/schema';

interface Props {
  providers: ProviderProfile[];
  defaults: ProfileDefaults;
  onChange: (defaults: ProfileDefaults) => void;
}

export function DefaultsPanel({ providers, defaults, onChange }: Props) {
  return (
    <div className="defaults">
      <label className="field">
        <span className="field__label">Global default</span>
        <select
          className="field__input"
          value={defaults.global ?? ''}
          onChange={(e) => onChange({ ...defaults, global: e.target.value || null })}
        >
          <option value="">— none —</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || 'Untitled provider'}
            </option>
          ))}
        </select>
        <span className="field__hint">Used by any feature without its own override.</span>
      </label>

      <div className="defaults__grid">
        <label className="field">
          <span className="field__label">Selection translation</span>
          <select
            className="field__input"
            value={defaults.selection ?? ''}
            onChange={(e) => onChange({ ...defaults, selection: e.target.value || undefined })}
          >
            <option value="">Use global default</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || 'Untitled provider'}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Page translation</span>
          <select
            className="field__input"
            value={defaults.page ?? ''}
            onChange={(e) => onChange({ ...defaults, page: e.target.value || undefined })}
          >
            <option value="">Use global default</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || 'Untitled provider'}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
