import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useT } from '@/i18n/useI18n';
import { LANGUAGES } from '@/languages';
import type { ImageAttachment } from '@/llm/types';
import { openTranslateStream } from '@/messaging/port-client';
import { useDrag } from '@/ui/useDrag';

interface Props {
  image: ImageAttachment;
  targetLang: string;
  onTargetLangChange: (code: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

type Status = 'streaming' | 'done' | 'error';

export function ImageResultPanel({
  image,
  targetLang,
  onTargetLangChange,
  onOpenSettings,
  onClose,
}: Props) {
  const t = useT();
  const [lang, setLang] = useState(targetLang);
  const [attempt, setAttempt] = useState(0);
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<Status>('streaming');
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const { pos, startDrag } = useDrag(panelRef);

  // Retry needs no bypassCache: translate-image is never cached (ADR-0006), so a new stream is always a real request.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt triggers retries
  useEffect(() => {
    setOutput('');
    setStatus('streaming');
    setError('');
    const handle = openTranslateStream(
      { kind: 'translate-image', feature: 'image', image, vars: { targetLang: lang } },
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
  }, [image, lang, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // The panel centers itself via left: 50% + translateX(-50%); once dragged,
  // the concrete coordinates must also clear that transform or the panel
  // would jump half its own width.
  const style: CSSProperties | undefined = pos
    ? { left: pos.x, top: pos.y, transform: 'none' }
    : undefined;

  // Drag the panel by its header; the close button keeps its own clicks.
  const onHeadPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    startDrag(e);
  };

  return (
    <div
      ref={panelRef}
      className="llmt-panel llmt-image-panel"
      style={style}
      role="dialog"
      aria-label={t('imageTranslate')}
    >
      <div className="llmt-panel__head" onPointerDown={onHeadPointerDown}>
        <span className="llmt-panel__grip" title={t('toolbarDrag')} aria-hidden="true">
          {t('imageTranslate')}
        </span>
        <button type="button" className="llmt-x" onClick={onClose} aria-label={t('panelClose')}>
          ×
        </button>
      </div>

      <div className="llmt-panel__body">
        {status === 'error' ? (
          <>
            <p className="llmt-error">{error}</p>
            <p className="llmt-muted">{t('imageNoVisionHint')}</p>
            <button type="button" className="llmt-link" onClick={onOpenSettings}>
              {t('imageOpenSettings')}
            </button>
          </>
        ) : (
          <p className="llmt-text">
            {output || (
              // "Translating…" only while genuinely streaming; a done-but-empty
              // stream is a failure state, not progress (docs/issues/0001).
              <span className="llmt-muted">
                {t(status === 'streaming' ? 'panelTranslating' : 'panelEmptyResult')}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="llmt-panel__foot">
        <label className="llmt-lang">
          <span aria-hidden="true">→</span>
          <select
            className="llmt-lang__select"
            value={lang}
            aria-label={t('targetLanguage')}
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
            {t('panelRetry')}
          </button>
          <button
            type="button"
            className="llmt-link"
            disabled={!output}
            onClick={() => navigator.clipboard?.writeText(output)}
          >
            {t('panelCopy')}
          </button>
        </div>
      </div>
    </div>
  );
}
