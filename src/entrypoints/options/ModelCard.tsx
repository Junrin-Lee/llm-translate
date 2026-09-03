import { useId, useState } from 'react';
import { useT } from '@/i18n/useI18n';
import type { LlmProvider, ModelProfile, Protocol } from '@/llm/types';
import { runRpc } from '@/messaging/port-client';

interface Props {
  profile: ModelProfile;
  providers: LlmProvider[];
  isGlobalDefault: boolean;
  onPatch: (patch: Partial<ModelProfile>) => void;
  onDelete: () => void;
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; latencyMs?: number }
  | { status: 'error'; message: string };

const MODEL_PLACEHOLDERS: Record<Protocol, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
};

export function ModelCard({ profile, providers, isGlobalDefault, onPatch, onDelete }: Props) {
  const t = useT();
  const listId = useId();
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [models, setModels] = useState<string[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);

  const provider = providers.find((p) => p.id === profile.providerId);

  async function handleTest() {
    setTest({ status: 'testing' });
    try {
      const ev = await runRpc({ kind: 'test-model', modelId: profile.id });
      if (ev.type === 'test-result') {
        setTest(
          ev.ok
            ? { status: 'ok', latencyMs: ev.latencyMs }
            : { status: 'error', message: ev.message ?? ev.errorCode ?? 'Test failed' },
        );
      } else if (ev.type === 'error') {
        setTest({ status: 'error', message: ev.message });
      } else {
        setTest({ status: 'error', message: 'Unexpected response' });
      }
    } catch (error) {
      setTest({ status: 'error', message: error instanceof Error ? error.message : 'Failed' });
    }
  }

  // A failure here used to arrive as an empty list, so a dead key read as
  // "no models returned, type the name yourself" (ADR-0007). Show the reason.
  async function handleFetchModels() {
    setFetchingModels(true);
    setFetchError(null);
    try {
      const ev = await runRpc({ kind: 'list-models', providerId: profile.providerId });
      if (ev.type === 'models') setModels(ev.models);
      else setFetchError(ev.type === 'error' ? ev.message : 'Unexpected response');
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed');
    } finally {
      setFetchingModels(false);
    }
  }

  function selectProvider(providerId: string) {
    // The old list belongs to the old connection; keeping it would mislead.
    setModels(null);
    setFetchError(null);
    onPatch({ providerId });
  }

  function patchParam(key: 'temperature' | 'maxTokens', raw: string) {
    const value = raw.trim() === '' ? undefined : Number(raw);
    onPatch({ params: { ...profile.params, [key]: Number.isFinite(value) ? value : undefined } });
  }

  return (
    <article className="card">
      <header className="card__head">
        <input
          className="card__name"
          value={profile.name}
          placeholder={t('modelNamePlaceholder')}
          aria-label={t('modelNameAria')}
          onChange={(e) => onPatch({ name: e.target.value })}
        />
        {isGlobalDefault && <span className="badge">{t('providerUsing')}</span>}
      </header>

      <label className="field">
        <span className="field__label">{t('fieldProvider')}</span>
        <select
          className="field__input"
          value={profile.providerId}
          onChange={(e) => selectProvider(e.target.value)}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || t('providerNamePlaceholder')}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field__label">{t('fieldModel')}</span>
        <div className="field__row">
          <input
            className="field__input mono"
            value={profile.model}
            placeholder={provider ? MODEL_PLACEHOLDERS[provider.protocol] : ''}
            spellCheck={false}
            autoComplete="off"
            list={listId}
            onChange={(e) => onPatch({ model: e.target.value })}
          />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleFetchModels}
            disabled={fetchingModels}
          >
            {fetchingModels ? t('actionFetching') : t('actionFetchModels')}
          </button>
        </div>
        {fetchError ? (
          <span className="status status--error" title={fetchError}>
            {fetchError}
          </span>
        ) : (
          models && (
            <span className="field__hint">
              {models.length > 0 ? t('modelsAvailable', { count: models.length }) : t('modelsNone')}
            </span>
          )
        )}
        <datalist id={listId}>
          {models?.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>

      <details className="advanced">
        <summary>{t('advanced')}</summary>
        <div className="advanced__grid">
          <label className="field">
            <span className="field__label">{t('fieldTemperature')}</span>
            <input
              className="field__input"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={profile.params?.temperature ?? ''}
              placeholder={t('placeholderDefault')}
              onChange={(e) => patchParam('temperature', e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">{t('fieldMaxTokens')}</span>
            <input
              className="field__input"
              type="number"
              step="1"
              min="1"
              value={profile.params?.maxTokens ?? ''}
              placeholder={provider?.protocol === 'anthropic' ? '4096' : t('placeholderDefault')}
              onChange={(e) => patchParam('maxTokens', e.target.value)}
            />
          </label>
        </div>
      </details>

      <footer className="card__foot">
        <button type="button" className="btn btn--primary" onClick={handleTest}>
          {t('actionTestModel')}
        </button>
        {test.status === 'testing' && (
          <span className="status status--muted">{t('statusTesting')}</span>
        )}
        {test.status === 'ok' && (
          <span className="status status--ok">
            {t('statusConnected')}
            {test.latencyMs != null ? ` · ${test.latencyMs}ms` : ''}
          </span>
        )}
        {test.status === 'error' && (
          <span className="status status--error" title={test.message}>
            {test.message}
          </span>
        )}
        <button type="button" className="btn btn--danger-ghost card__delete" onClick={onDelete}>
          {t('actionDelete')}
        </button>
      </footer>
    </article>
  );
}
