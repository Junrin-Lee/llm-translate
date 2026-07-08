import { type PointerEvent as ReactPointerEvent, type RefObject, useState } from 'react';

export interface DragPos {
  x: number;
  y: number;
}

const EDGE = 4; // keep at least this many px inside the viewport

/**
 * Pointer-drag repositioning for a `position: fixed` element. Returns the
 * current dragged position (null until first dragged) and a `startDrag` handler
 * to attach to a grip/handle. The position is clamped to the viewport so the
 * element can't be lost off-screen.
 */
export function useDrag(ref: RefObject<HTMLElement | null>): {
  pos: DragPos | null;
  startDrag: (e: ReactPointerEvent) => void;
} {
  const [pos, setPos] = useState<DragPos | null>(null);

  function startDrag(e: ReactPointerEvent): void {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const onMove = (ev: PointerEvent) => {
      const x = Math.min(
        Math.max(ev.clientX - offsetX, EDGE),
        window.innerWidth - el.offsetWidth - EDGE,
      );
      const y = Math.min(
        Math.max(ev.clientY - offsetY, EDGE),
        window.innerHeight - el.offsetHeight - EDGE,
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

  return { pos, startDrag };
}
