import { useT } from '@/i18n/useI18n';
import type { ModelProfile } from '@/llm/types';
import type { ProfileDefaults } from '@/storage/schema';

interface Props {
  models: ModelProfile[];
  defaults: ProfileDefaults;
  onChange: (defaults: ProfileDefaults) => void;
}

export function DefaultsPanel({ models, defaults, onChange }: Props) {
  const t = useT();
  const name = (m: ModelProfile) => m.name || t('modelNamePlaceholder');

  return (
    <div className="defaults">
      <label className="field">
        <span className="field__label">{t('routingGlobalDefault')}</span>
        <select
          className="field__input"
          value={defaults.global ?? ''}
          onChange={(e) => onChange({ ...defaults, global: e.target.value || null })}
        >
          <option value="">{t('routingNone')}</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {name(m)}
            </option>
          ))}
        </select>
        <span className="field__hint">{t('routingGlobalHint')}</span>
      </label>

      <div className="defaults__grid">
        <label className="field">
          <span className="field__label">{t('routingSelection')}</span>
          <select
            className="field__input"
            value={defaults.selection ?? ''}
            onChange={(e) => onChange({ ...defaults, selection: e.target.value || undefined })}
          >
            <option value="">{t('routingUseGlobal')}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {name(m)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">{t('routingPage')}</span>
          <select
            className="field__input"
            value={defaults.page ?? ''}
            onChange={(e) => onChange({ ...defaults, page: e.target.value || undefined })}
          >
            <option value="">{t('routingUseGlobal')}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {name(m)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">{t('routingImage')}</span>
          <select
            className="field__input"
            value={defaults.image ?? ''}
            onChange={(e) => onChange({ ...defaults, image: e.target.value || undefined })}
          >
            <option value="">{t('routingUseGlobal')}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {name(m)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">{t('routingSearch')}</span>
          <select
            className="field__input"
            value={defaults.search ?? ''}
            onChange={(e) => onChange({ ...defaults, search: e.target.value || undefined })}
          >
            <option value="">{t('routingUseSelection')}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {name(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
