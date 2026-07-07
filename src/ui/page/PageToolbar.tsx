import { useSyncExternalStore } from 'react';
import { cancel, getState, restore, subscribe } from './store';

export function PageToolbar() {
  const state = useSyncExternalStore(subscribe, getState);
  if (state.status === 'idle') return null;

  const translating = state.status === 'translating';
  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <div className="llmt-toolbar" role="status" aria-live="polite">
      {translating ? (
        <>
          <span className="llmt-toolbar__label">
            Translating {state.done}/{state.total}
          </span>
          <span className="llmt-toolbar__bar">
            <span className="llmt-toolbar__fill" style={{ width: `${pct}%` }} />
          </span>
          <button type="button" className="llmt-toolbar__btn" onClick={cancel}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="llmt-toolbar__label">Translated</span>
          <button
            type="button"
            className="llmt-toolbar__btn llmt-toolbar__btn--primary"
            onClick={restore}
          >
            Restore original
          </button>
        </>
      )}
    </div>
  );
}
