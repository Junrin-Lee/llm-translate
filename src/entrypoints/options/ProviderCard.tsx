import { useState } from 'react';
import { useT } from '@/i18n/useI18n';
import { isCleartextRemote } from '@/llm/base-url';
import type { LlmProvider, Protocol } from '@/llm/types';
import { runRpc } from '@/messaging/port-client';

interface Props {
  provider: LlmProvider;
  /** How many Model Profiles sit on this connection; deleting is blocked above zero. */
  inUseCount: number;
  onPatch: (patch: Partial<LlmProvider>) => void;
  onDelete: () => void;
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; latencyMs?: number }
  | { status: 'error'; message: string };

const BASE_URL_PLACEHOLDERS: Record<Protocol, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
};

export function ProviderCard({ provider, inUseCount, onPatch, onDelete }: Props) {
  const t = useT();
  const [revealKey, setRevealKey] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  async function handleTest() {
    setTest({ status: 'testing' });
    try {
      const ev = await runRpc({ kind: 'test-provider', providerId: provider.id });
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

  return (
    <article className="card">
      <header className="card__head">
        <input
          className="card__name"
          value={provider.name}
          placeholder={t('providerNamePlaceholder')}
          aria-label={t('providerNameAria')}
          onChange={(e) => onPatch({ name: e.target.value })}
        />
        <div className="segmented">
          {(['openai', 'anthropic'] as const).map((p) => (
            <button
              type="button"
              key={p}
              className={`segmented__opt${provider.protocol === p ? ' is-active' : ''}`}
              aria-label={`Protocol: ${p === 'openai' ? 'OpenAI' : 'Anthropic'}`}
              aria-pressed={provider.protocol === p}
              onClick={() => onPatch({ protocol: p })}
            >
              {p === 'openai' ? 'OpenAI' : 'Anthropic'}
            </button>
          ))}
        </div>
      </header>

      <label className="field">
        <span className="field__label">{t('fieldBaseUrl')}</span>
        <input
          className="field__input mono"
          value={provider.baseUrl}
          placeholder={BASE_URL_PLACEHOLDERS[provider.protocol]}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onPatch({ baseUrl: e.target.value })}
        />
        {isCleartextRemote(provider.baseUrl) && (
          <span className="field__hint field__hint--warn">{t('baseUrlCleartextWarning')}</span>
        )}
      </label>

      <label className="field">
        <span className="field__label">{t('fieldApiKey')}</span>
        <div className="field__row">
          <input
            className="field__input mono"
            type={revealKey ? 'text' : 'password'}
            value={provider.apiKey}
            placeholder="sk-…"
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => onPatch({ apiKey: e.target.value })}
          />
          <button type="button" className="btn btn--ghost" onClick={() => setRevealKey((v) => !v)}>
            {revealKey ? t('actionHide') : t('actionShow')}
          </button>
        </div>
        <span className="field__hint">{t('apiKeyHint')}</span>
      </label>

      <footer className="card__foot">
        <button type="button" className="btn btn--primary" onClick={handleTest}>
          {t('actionTestProvider')}
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
        <button
          type="button"
          className="btn btn--danger-ghost card__delete"
          onClick={onDelete}
          disabled={inUseCount > 0}
          title={inUseCount > 0 ? t('providerInUseHint', { count: inUseCount }) : undefined}
        >
          {t('actionDelete')}
        </button>
      </footer>
    </article>
  );
}
