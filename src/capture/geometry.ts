/** Pure geometry for Image Translation capture & crop. No DOM access here. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Drags smaller than this (CSS px on either edge) are treated as accidental. */
export const MIN_REGION_CSS_PX = 8;
/** Longest output edge sent to the LLM; keeps every provider's per-image limit safe (ADR-0006). */
export const MAX_IMAGE_EDGE = 2000;
export const JPEG_QUALITY = 0.92;

/** Turn two drag endpoints (any direction) into a positive rect. */
export function normalizeDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/**
 * Map a region expressed in container CSS pixels onto the captured image's
 * pixel grid. captureVisibleTab renders at devicePixelRatio, so the scale is
 * derived from the actual sizes rather than trusting window.devicePixelRatio.
 */
export function toImageRect(
  regionCss: Rect,
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
): Rect {
  const scaleX = imageWidth / containerWidth;
  const scaleY = imageHeight / containerHeight;
  const x = Math.max(0, Math.round(regionCss.x * scaleX));
  const y = Math.max(0, Math.round(regionCss.y * scaleY));
  return {
    x,
    y,
    width: Math.min(imageWidth - x, Math.round(regionCss.width * scaleX)),
    height: Math.min(imageHeight - y, Math.round(regionCss.height * scaleY)),
  };
}

/** Proportionally fit a size inside maxEdge (no upscaling). */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Split a data URL into media type + raw base64; null when it isn't one. */
export function parseDataUrl(dataUrl: string): { mediaType: string; dataBase64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], dataBase64: match[2] };
}
