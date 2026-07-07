import { useId, useState } from 'react';
import type { Protocol, ProviderProfile } from '@/llm/types';
import { runRpc } from '@/messaging/port-client';

interface Props {
  profile: ProviderProfile;
  isGlobalDefault: boolean;
  onPatch: (patch: Partial<ProviderProfile>) => void;
  onDelete: () => void;
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; latencyMs?: number }
  | { status: 'error'; message: string };

const PLACEHOLDERS: Record<Protocol, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-latest' },
};

export function ProviderCard({ profile, isGlobalDefault, onPatch, onDelete }: Props) {
  const listId = useId();
  const [revealKey, setRevealKey] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [models, setModels] = useState<string[] | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);

  const ph = PLACEHOLDERS[profile.protocol];

  async function handleTest() {
    setTest({ status: 'testing' });
    try {
      const ev = await runRpc({ kind: 'test-connection', profileId: profile.id });
      if (ev.type === 'test-result') {
        setTest(
          ev.ok
            ? { status: 'ok', latencyMs: ev.latencyMs }
            : { status: 'error', message: ev.message ?? ev.errorCode ?? 'Connection failed' },
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

  async function handleFetchModels() {
    setFetchingModels(true);
    try {
      const ev = await runRpc({ kind: 'list-models', profileId: profile.id });
      setModels(ev.type === 'models' ? ev.models : []);
    } catch {
      setModels([]);
    } finally {
      setFetchingModels(false);
    }
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
          placeholder="Untitled provider"
          aria-label="Provider name"
          onChange={(e) => onPatch({ name: e.target.value })}
        />
        {isGlobalDefault && <span className="badge">Using</span>}
        <div className="segmented">
          {(['openai', 'anthropic'] as const).map((p) => (
            <button
              type="button"
              key={p}
              className={`segmented__opt${profile.protocol === p ? ' is-active' : ''}`}
              aria-label={`Protocol: ${p === 'openai' ? 'OpenAI' : 'Anthropic'}`}
              aria-pressed={profile.protocol === p}
              onClick={() => onPatch({ protocol: p })}
            >
              {p === 'openai' ? 'OpenAI' : 'Anthropic'}
            </button>
          ))}
        </div>
      </header>

      <label className="field">
        <span className="field__label">Base URL</span>
        <input
          className="field__input mono"
          value={profile.baseUrl}
          placeholder={ph.baseUrl}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onPatch({ baseUrl: e.target.value })}
        />
      </label>

      <label className="field">
        <span className="field__label">API key</span>
        <div className="field__row">
          <input
            className="field__input mono"
            type={revealKey ? 'text' : 'password'}
            value={profile.apiKey}
            placeholder="sk-…"
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => onPatch({ apiKey: e.target.value })}
          />
          <button type="button" className="btn btn--ghost" onClick={() => setRevealKey((v) => !v)}>
            {revealKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <span className="field__hint">Stored only on this device.</span>
      </label>

      <label className="field">
        <span className="field__label">Model</span>
        <div className="field__row">
          <input
            className="field__input mono"
            value={profile.model}
            placeholder={ph.model}
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
            {fetchingModels ? 'Fetching…' : 'Fetch models'}
          </button>
        </div>
        {models && (
          <span className="field__hint">
            {models.length > 0
              ? `${models.length} models available — pick from the list.`
              : 'No models returned. Enter the model name manually.'}
          </span>
        )}
        <datalist id={listId}>
          {models?.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>

      <details className="advanced">
        <summary>Advanced</summary>
        <div className="advanced__grid">
          <label className="field">
            <span className="field__label">Temperature</span>
            <input
              className="field__input"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={profile.params?.temperature ?? ''}
              placeholder="default"
              onChange={(e) => patchParam('temperature', e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Max tokens</span>
            <input
              className="field__input"
              type="number"
              step="1"
              min="1"
              value={profile.params?.maxTokens ?? ''}
              placeholder={profile.protocol === 'anthropic' ? '4096' : 'default'}
              onChange={(e) => patchParam('maxTokens', e.target.value)}
            />
          </label>
        </div>
      </details>

      <footer className="card__foot">
        <button type="button" className="btn btn--primary" onClick={handleTest}>
          Test connection
        </button>
        {test.status === 'testing' && <span className="status status--muted">Testing…</span>}
        {test.status === 'ok' && (
          <span className="status status--ok">
            Connected{test.latencyMs != null ? ` · ${test.latencyMs}ms` : ''}
          </span>
        )}
        {test.status === 'error' && (
          <span className="status status--error" title={test.message}>
            {test.message}
          </span>
        )}
        <button type="button" className="btn btn--danger-ghost card__delete" onClick={onDelete}>
          Delete
        </button>
      </footer>
    </article>
  );
}
