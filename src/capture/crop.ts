import type { ImageAttachment } from '@/llm/types';
import {
  fitWithin,
  JPEG_QUALITY,
  MAX_IMAGE_EDGE,
  parseDataUrl,
  type Rect,
  toImageRect,
} from './geometry';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

function toAttachment(canvas: HTMLCanvasElement): ImageAttachment {
  const parsed = parseDataUrl(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
  if (!parsed) throw new Error('Canvas produced an unexpected data URL');
  return parsed;
}

function drawRegion(img: HTMLImageElement, region: Rect): HTMLCanvasElement {
  const out = fitWithin(region.width, region.height, MAX_IMAGE_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d context unavailable');
  ctx.drawImage(img, region.x, region.y, region.width, region.height, 0, 0, out.width, out.height);
  return canvas;
}

/** Crop a region (container CSS px) out of a captured data URL → JPEG attachment. */
export async function cropToAttachment(
  sourceDataUrl: string,
  regionCss: Rect,
  container: { width: number; height: number },
): Promise<ImageAttachment> {
  const img = await loadImage(sourceDataUrl);
  const region = toImageRect(
    regionCss,
    img.naturalWidth,
    img.naturalHeight,
    container.width,
    container.height,
  );
  return toAttachment(drawRegion(img, region));
}
