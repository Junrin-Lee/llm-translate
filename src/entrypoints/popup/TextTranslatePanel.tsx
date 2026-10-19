import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/useI18n';
import { LANGUAGES } from '@/languages';
import { openTranslateStream } from '@/messaging/port-client';

interface Props {
  /** Starting target language — the global Target language from settings. */
  defaultTargetLang: string;
  onBack: () => void;
}

type Status = 'idle' | 'streaming' | 'done' | 'error';

/** How long after the last typed edit the panel waits before translating on its own. */
export const AUTO_TRANSLATE_DELAY_MS = 2000;

/**
 * Text translation inside the popup: type or paste text, pick a target
 * language, translate. Rides the selection pipeline (same model routing,
 * same "Selection translation" prompt, same cache) — it is selection
 * translation without a page. The language choice is per use and is not
 * written back to settings.
 *
 * A paste translates right away. Typing arms an auto-translate instead: once
 * the text has sat unchanged for AUTO_TRANSLATE_DELAY_MS without a manual
 * translate, it fires on its own. Each further keystroke restarts the wait, an
 * open IME composition holds it (so half-typed pinyin is never sent), and any
 * manual translate disarms it.
 */
export function TextTranslatePanel({ defaultTargetLang, onBack }: Props) {
  const t = useT();
  const [text, setText] = useState('');
  const [lang, setLang] = useState(defaultTargetLang);
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [autoPending, setAutoPending] = useState(false);
  const [composing, setComposing] = useState(false);
  const streamRef = useRef<{ cancel: () => void } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Set by the paste event so the change it causes translates at once.
  const pastedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    return () => streamRef.current?.cancel();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-arm on every text/lang change; translate is recreated each render
  useEffect(() => {
    if (!autoPending || composing) return;
    const id = setTimeout(() => translate(text, lang), AUTO_TRANSLATE_DELAY_MS);
    return () => clearTimeout(id);
  }, [autoPending, composing, text, lang]);

  function translate(source: string, targetLang: string, bypassCache = false) {
    setAutoPending(false);
    const trimmed = source.trim();
    if (!trimmed) return;
    streamRef.current?.cancel();
    setOutput('');
    setStatus('streaming');
    setError('');
    streamRef.current = openTranslateStream(
      {
        kind: 'translate-stream',
        feature: 'selection',
        promptKind: 'selectionText',
        vars: { text: trimmed, targetLang },
        bypassCache,
      },
      {
        onDelta: (chunk) => setOutput((prev) => prev + chunk),
        onDone: () => setStatus('done'),
        onError: (message) => {
          setStatus('error');
          setError(message);
        },
      },
    );
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      translate(text, lang);
    }
  };

  const canTranslate = text.trim().length > 0 && status !== 'streaming';

  return (
    <div className="popup__text">
      <div className="popup__bar">
        <button type="button" className="popup__back" onClick={onBack} aria-label={t('textBack')}>
          ←
        </button>
        <h1 className="popup__title popup__title--bar">{t('textTranslate')}</h1>
      </div>

      <textarea
        ref={inputRef}
        className="popup__input"
        rows={5}
        value={text}
        placeholder={t('textInputPlaceholder')}
        aria-label={t('textTranslate')}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (pastedRef.current) {
            pastedRef.current = false;
            translate(next, lang);
          } else {
            setAutoPending(true);
          }
        }}
        onPaste={() => {
          pastedRef.current = true;
          // A paste that leaves the value unchanged fires no change event;
          // don't let the flag leak into the next keystroke.
          setTimeout(() => {
            pastedRef.current = false;
          }, 0);
        }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={onKeyDown}
      />

      <div className="popup__row">
        <label className="popup__lang">
          <span aria-hidden="true">→</span>
          <select
            className="popup__select"
            value={lang}
            aria-label={t('targetLanguage')}
            onChange={(e) => {
              const next = e.target.value;
              setLang(next);
              // A finished result follows the new language right away.
              if (status !== 'idle') translate(text, next);
            }}
          >
            {!LANGUAGES.some((l) => l.code === lang) && <option value={lang}>{lang}</option>}
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="popup__btn popup__btn--inline"
          disabled={!canTranslate}
          title={t('textShortcutHint')}
          onClick={() => translate(text, lang)}
        >
          {t('textTranslateAction')}
        </button>
      </div>

      {status !== 'idle' && (
        <>
          <div className="popup__result" aria-live="polite">
            {status === 'error' ? (
              <p className="popup__error">{error}</p>
            ) : (
              <p className="popup__output">
                {output || (
                  // "Translating…" only while genuinely streaming; a done-but-empty
                  // stream is a failure state, not progress (docs/issues/0001).
                  <span className="popup__muted">
                    {t(status === 'streaming' ? 'panelTranslating' : 'panelEmptyResult')}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="popup__links">
            <button
              type="button"
              className="popup__link"
              disabled={status === 'streaming'}
              onClick={() => translate(text, lang, true)}
            >
              {t('panelRetry')}
            </button>
            <button
              type="button"
              className="popup__link"
              disabled={!output}
              onClick={() => navigator.clipboard?.writeText(output)}
            >
              {t('panelCopy')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
