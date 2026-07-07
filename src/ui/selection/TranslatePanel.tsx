import { useEffect, useMemo, useRef, useState } from 'react';
import { LANGUAGES } from '@/languages';
import { openTranslateStream } from '@/messaging/port-client';
import { parseDictResult } from '@/selection/dict-result';
import { DictCard } from './DictCard';

interface Props {
  text: string;
  rect: DOMRect;
  targetLang: string;
  initialMode: 'dict' | 'text';
  onClose: () => void;
  onTargetLangChange: (code: string) => void;
}

type Status = 'streaming' | 'done' | 'error';

const PANEL_WIDTH = 360;
const PANEL_EST_HEIGHT = 260;

export function TranslatePanel({
  text,
  rect,
  targetLang,
  initialMode,
  onClose,
  onTargetLangChange,
}: Props) {
  const [mode, setMode] = useState<'dict' | 'text'>(initialMode);
  const [lang, setLang] = useState(targetLang);
  const [attempt, setAttempt] = useState(0);
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<Status>('streaming');
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOutput('');
    setStatus('streaming');
    setError('');
    const handle = openTranslateStream(
      {
        kind: 'translate-stream',
        feature: 'selection',
        promptKind: mode === 'dict' ? 'selectionDict' : 'selectionText',
        vars: { text, targetLang: lang },
        // A manual retry refetches instead of serving the cached result.
        bypassCache: attempt > 0,
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
    return () => handle.cancel();
  }, [text, lang, mode, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Close on a click anywhere outside the panel. composedPath sees through the
    // Shadow DOM; capture phase runs regardless of stopPropagation on the page.
    const onPointerDown = (e: Event) => {
      const panel = panelRef.current;
      if (panel && !e.composedPath().includes(panel)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown, true);
    };
  }, [onClose]);

  const dict = useMemo(
    () => (mode === 'dict' && status === 'done' ? parseDictResult(output) : null),
    [mode, status, output],
  );

  const copyText = dict ? dict.senses.map((s) => s.meaning).join('; ') : output;

  const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8));
  const opensDownward = rect.bottom + 8 + PANEL_EST_HEIGHT <= window.innerHeight;
  const position = opensDownward
    ? { top: `${rect.bottom + 8}px` }
    : { bottom: `${window.innerHeight - rect.top + 8}px` };

  return (
    <div
      ref={panelRef}
      className="llmt-panel"
      style={{ left: `${left}px`, ...position }}
      role="dialog"
      aria-label="Translation"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="llmt-panel__head">
        <div className="llmt-seg">
          <button
            type="button"
            className={`llmt-seg__opt${mode === 'dict' ? ' is-active' : ''}`}
            onClick={() => setMode('dict')}
          >
            Dictionary
          </button>
          <button
            type="button"
            className={`llmt-seg__opt${mode === 'text' ? ' is-active' : ''}`}
            onClick={() => setMode('text')}
          >
            Translation
          </button>
        </div>
        <button type="button" className="llmt-x" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="llmt-panel__body">
        {status === 'error' ? (
          <p className="llmt-error">{error}</p>
        ) : mode === 'dict' && status !== 'done' ? (
          <p className="llmt-muted">Looking up…</p>
        ) : dict ? (
          <DictCard result={dict} />
        ) : (
          <p className="llmt-text">{output || <span className="llmt-muted">Translating…</span>}</p>
        )}
      </div>

      <div className="llmt-panel__foot">
        <label className="llmt-lang">
          <span aria-hidden="true">→</span>
          <select
            className="llmt-lang__select"
            value={lang}
            aria-label="Target language"
            onChange={(e) => {
              setLang(e.target.value);
              onTargetLangChange(e.target.value);
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
        <div className="llmt-actions">
          <button type="button" className="llmt-link" onClick={() => setAttempt((a) => a + 1)}>
            Retry
          </button>
          <button
            type="button"
            className="llmt-link"
            disabled={!copyText}
            onClick={() => navigator.clipboard?.writeText(copyText)}
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
