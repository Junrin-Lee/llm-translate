import { useRef, useState, useSyncExternalStore } from 'react';
import { cancel, getState, restore, subscribe } from './store';

export function PageToolbar() {
  const state = useSyncExternalStore(subscribe, getState);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  if (state.status === 'idle') return null;

  const translating = state.status === 'translating';
  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;

  // Drag by the grip; clamp within the viewport so it can't be lost off-screen.
  function startDrag(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const onMove = (ev: PointerEvent) => {
      const x = Math.min(Math.max(ev.clientX - offsetX, 4), window.innerWidth - el.offsetWidth - 4);
      const y = Math.min(
        Math.max(ev.clientY - offsetY, 4),
        window.innerHeight - el.offsetHeight - 4,
      );
      setPos({ x, y });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  }

  const style = pos
    ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' }
    : undefined;

  return (
    <div ref={ref} className="llmt-toolbar" style={style} role="status" aria-live="polite">
      <span className="llmt-toolbar__grip" onPointerDown={startDrag} title="Drag to move">
        ⠿
      </span>
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
