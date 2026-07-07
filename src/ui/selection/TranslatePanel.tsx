import { useEffect, useMemo, useState } from 'react';
import { openTranslateStream } from '@/messaging/port-client';
import { parseDictResult } from '@/selection/dict-result';
import { DictCard } from './DictCard';

interface Props {
  text: string;
  rect: DOMRect;
  targetLang: string;
  initialMode: 'dict' | 'text';
  onClose: () => void;
}

type Status = 'streaming' | 'done' | 'error';

const PANEL_WIDTH = 360;
const PANEL_EST_HEIGHT = 260;

export function TranslatePanel({ text, rect, targetLang, initialMode, onClose }: Props) {
  const [mode, setMode] = useState<'dict' | 'text'>(initialMode);
  const [attempt, setAttempt] = useState(0);
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<Status>('streaming');
  const [error, setError] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a manual retry trigger.
  useEffect(() => {
    setOutput('');
    setStatus('streaming');
    setError('');
    const handle = openTranslateStream(
      {
        kind: 'translate-stream',
        feature: 'selection',
        promptKind: mode === 'dict' ? 'selectionDict' : 'selectionText',
        vars: { text, targetLang },
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
  }, [text, targetLang, mode, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
        <span className="llmt-lang">→ {targetLang}</span>
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
