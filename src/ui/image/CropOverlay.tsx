import { type PointerEvent as ReactPointerEvent, useEffect, useState } from 'react';
import { isRegionTooSmall, normalizeDrag, type Rect } from '@/capture/geometry';
import { useT } from '@/i18n/useI18n';

interface Props {
  /** The frozen capture (or uploaded image) shown behind the drag layer. */
  imageUrl: string;
  /** Region is in this component's own CSS pixel space; container is its size. */
  onConfirm: (regionCss: Rect, container: { width: number; height: number }) => void;
  onCancel: () => void;
  /** One-time privacy notice (ADR-0006); host decides via the stored flag. */
  showNotice: boolean;
  onNoticeDismiss: () => void;
}

type Drag = { start: { x: number; y: number }; end: { x: number; y: number } };

export function CropOverlay({ imageUrl, onConfirm, onCancel, showNotice, onNoticeDismiss }: Props) {
  const t = useT();
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const local = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    setDrag({ start: p, end: p });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag) setDrag({ ...drag, end: local(e) });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const box = e.currentTarget.getBoundingClientRect();
    const region = normalizeDrag(drag.start, drag.end);
    setDrag(null);
    if (isRegionTooSmall(region)) return;
    onConfirm(region, { width: box.width, height: box.height });
  };

  const rect = drag ? normalizeDrag(drag.start, drag.end) : null;

  return (
    <div
      className="llmt-crop"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <img className="llmt-crop__img" src={imageUrl} alt="" draggable={false} />
      {rect ? (
        <div
          className="llmt-crop__region"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        />
      ) : (
        <div className="llmt-crop__mask" />
      )}
      <div className="llmt-crop__hint">{t('imageCaptureHint')}</div>
      {showNotice && (
        <div className="llmt-crop__notice">
          <span>{t('imagePrivacyNotice')}</span>
          <button
            type="button"
            className="llmt-link"
            onClick={onNoticeDismiss}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {t('imagePrivacyGotIt')}
          </button>
        </div>
      )}
    </div>
  );
}
