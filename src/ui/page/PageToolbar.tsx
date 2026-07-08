import { useRef, useSyncExternalStore } from 'react';
import { useT } from '@/i18n/useI18n';
import { useDrag } from '@/ui/useDrag';
import { cancel, getState, restore, retryFailed, setMode, subscribe } from './store';

export function PageToolbar() {
  const t = useT();
  const state = useSyncExternalStore(subscribe, getState);
  const ref = useRef<HTMLDivElement>(null);
  const { pos, startDrag } = useDrag(ref);

  if (state.status === 'idle') return null;

  const translating = state.status === 'translating';
  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;

  const style = pos
    ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' }
    : undefined;

  return (
    <div ref={ref} className="llmt-toolbar" style={style} role="status" aria-live="polite">
      <span className="llmt-toolbar__grip" onPointerDown={startDrag} title={t('toolbarDrag')}>
        ⠿
      </span>
      <button
        type="button"
        className="llmt-toolbar__btn"
        title={t('toolbarModeTitle')}
        onClick={() => void setMode(state.mode === 'bilingual' ? 'replace' : 'bilingual')}
      >
        {state.mode === 'bilingual' ? t('toolbarBilingual') : t('toolbarOnly')}
      </button>
      {translating ? (
        <>
          <span className="llmt-toolbar__label">
            {t('toolbarTranslating')} {state.done}/{state.total}
          </span>
          <span className="llmt-toolbar__bar">
            <span className="llmt-toolbar__fill" style={{ width: `${pct}%` }} />
          </span>
          <button type="button" className="llmt-toolbar__btn" onClick={cancel}>
            {t('toolbarCancel')}
          </button>
        </>
      ) : (
        <>
          <span className="llmt-toolbar__label">{t('toolbarTranslated')}</span>
          {state.errors > 0 && (
            <button
              type="button"
              className="llmt-toolbar__btn llmt-toolbar__btn--primary"
              onClick={retryFailed}
            >
              {t('toolbarRetryFailed', { count: state.errors })}
            </button>
          )}
          <button
            type="button"
            className={`llmt-toolbar__btn${state.errors > 0 ? '' : ' llmt-toolbar__btn--primary'}`}
            onClick={restore}
          >
            {t('restoreOriginal')}
          </button>
        </>
      )}
    </div>
  );
}
