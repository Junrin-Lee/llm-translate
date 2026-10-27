import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useT } from '@/i18n/useI18n';
import { LANGUAGES } from '@/languages';
import { openTranslateStream } from '@/messaging/port-client';
import { parseDictResult } from '@/selection/dict-result';
import { useDrag } from '@/ui/useDrag';
import { DictCard } from './DictCard';
import { MarkdownView } from './MarkdownView';
import { bodyMaxHeightAt, computePanelPlacement } from './panel-position';

type Mode = 'dict' | 'text' | 'search';

interface Props {
  text: string;
  rect: DOMRect;
  targetLang: string;
  initialMode: Mode;
  /** Adds the Search tab; only set when the panel was opened from the search icon. */
  showSearch?: boolean;
  onClose: () => void;
  onTargetLangChange: (code: string) => void;
}

type Status = 'streaming' | 'done' | 'error';

/** A finished search, kept so switching tabs and back does not search again. */
interface SearchMemo {
  key: string;
  output: string;
  status: Status;
  error: string;
}

export function TranslatePanel({
  text,
  rect,
  targetLang,
  initialMode,
  showSearch = false,
  onClose,
  onTargetLangChange,
}: Props) {
  const t = useT();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [lang, setLang] = useState(targetLang);
  const [attempt, setAttempt] = useState(0);
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<Status>('streaming');
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const searchMemo = useRef<SearchMemo | null>(null);
  const { pos, startDrag } = useDrag(panelRef);

  useEffect(() => {
    // Search results are never cached in the background, so remember the last
    // one here; Retry and a language change both alter the key and search again.
    const searchKey = `${lang}|${attempt}`;
    const memo = searchMemo.current;
    if (mode === 'search' && memo?.key === searchKey) {
      setOutput(memo.output);
      setStatus(memo.status);
      setError(memo.error);
      return;
    }

    setOutput('');
    setStatus('streaming');
    setError('');
    let received = '';
    const handle = openTranslateStream(
      mode === 'search'
        ? { kind: 'search-stream', feature: 'search', vars: { text, targetLang: lang } }
        : {
            kind: 'translate-stream',
            feature: 'selection',
            promptKind: mode === 'dict' ? 'selectionDict' : 'selectionText',
            vars: { text, targetLang: lang },
            // A manual retry refetches instead of serving the cached result.
            bypassCache: attempt > 0,
          },
      {
        onDelta: (chunk) => {
          received += chunk;
          setOutput(received);
        },
        onDone: () => {
          setStatus('done');
          if (mode === 'search') {
            searchMemo.current = { key: searchKey, output: received, status: 'done', error: '' };
          }
        },
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
    // Close on a click anywhere outside the panel; capture phase runs regardless
    // of stopPropagation on the page. Hit-test by position: seen from document,
    // composedPath() stops at the host of a closed shadow root.
    const onPointerDown = (e: MouseEvent) => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) onClose();
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

  const placement = computePanelPlacement(rect, window.innerWidth, window.innerHeight);
  const style: CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : placement.anchor === 'top'
      ? { left: placement.left, top: placement.offset }
      : { left: placement.left, bottom: placement.offset };
  const bodyMaxHeight = pos ? bodyMaxHeightAt(pos.y, window.innerHeight) : placement.bodyMaxHeight;

  // Drag the panel by its header; the tabs and close button keep their own clicks.
  const onHeadPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    startDrag(e);
  };

  return (
    <div
      ref={panelRef}
      className="llmt-panel"
      style={style}
      role="dialog"
      aria-label={t('panelTranslation')}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="llmt-panel__head" onPointerDown={onHeadPointerDown}>
        <span className="llmt-panel__grip" title={t('toolbarDrag')} aria-hidden="true">
          ⠿
        </span>
        <div className="llmt-seg">
          <button
            type="button"
            className={`llmt-seg__opt${mode === 'dict' ? ' is-active' : ''}`}
            onClick={() => setMode('dict')}
          >
            {t('panelDictionary')}
          </button>
          <button
            type="button"
            className={`llmt-seg__opt${mode === 'text' ? ' is-active' : ''}`}
            onClick={() => setMode('text')}
          >
            {t('panelTranslation')}
          </button>
          {showSearch && (
            <button
              type="button"
              className={`llmt-seg__opt${mode === 'search' ? ' is-active' : ''}`}
              onClick={() => setMode('search')}
            >
              {t('panelSearch')}
            </button>
          )}
        </div>
        <button type="button" className="llmt-x" onClick={onClose} aria-label={t('panelClose')}>
          ×
        </button>
      </div>

      <div className="llmt-panel__body" style={{ maxHeight: bodyMaxHeight }}>
        {status === 'error' ? (
          <p className="llmt-error">{error}</p>
        ) : mode === 'dict' && status !== 'done' ? (
          <p className="llmt-muted">{t('panelLookingUp')}</p>
        ) : dict ? (
          <DictCard result={dict} />
        ) : mode === 'search' ? (
          output ? (
            <MarkdownView source={output} />
          ) : (
            <p className="llmt-muted">
              {t(status === 'streaming' ? 'panelSearching' : 'panelEmptyResult')}
            </p>
          )
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
            disabled={!copyText}
            onClick={() => navigator.clipboard?.writeText(copyText)}
          >
            {t('panelCopy')}
          </button>
        </div>
      </div>
    </div>
  );
}
