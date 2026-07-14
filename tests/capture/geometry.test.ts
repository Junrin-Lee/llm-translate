import { describe, expect, it } from 'vitest';
import {
  fitWithin,
  isRegionTooSmall,
  normalizeDrag,
  parseDataUrl,
  toImageRect,
} from '@/capture/geometry';

describe('normalizeDrag', () => {
  it('produces a positive rect regardless of drag direction', () => {
    expect(normalizeDrag({ x: 100, y: 80 }, { x: 20, y: 30 })).toEqual({
      x: 20,
      y: 30,
      width: 80,
      height: 50,
    });
  });
});

describe('toImageRect', () => {
  it('scales CSS coordinates up to image pixels (devicePixelRatio 2)', () => {
    // 1280×800 viewport captured at 2560×1600.
    expect(toImageRect({ x: 10, y: 20, width: 100, height: 50 }, 2560, 1600, 1280, 800)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });
  });

  it('clamps the region to the image bounds', () => {
    const rect = toImageRect({ x: 1200, y: 700, width: 200, height: 200 }, 2560, 1600, 1280, 800);
    expect(rect).toEqual({ x: 2400, y: 1400, width: 160, height: 200 });
  });

  it('never returns negative dimensions for an out-of-container region', () => {
    const rect = toImageRect({ x: 1281, y: 810, width: 100, height: 50 }, 2560, 1600, 1280, 800);
    expect(rect).toEqual({ x: 2560, y: 1600, width: 0, height: 0 });
  });
});

describe('fitWithin', () => {
  it('returns the size unchanged when under the max edge', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });

  it('downscales proportionally when over the max edge', () => {
    expect(fitWithin(4000, 1000, 2000)).toEqual({ width: 2000, height: 500 });
  });
});

describe('parseDataUrl', () => {
  it('splits media type and base64 payload', () => {
    expect(parseDataUrl('data:image/png;base64,iVBOR')).toEqual({
      mediaType: 'image/png',
      dataBase64: 'iVBOR',
    });
  });

  it('returns null for a non-data URL', () => {
    expect(parseDataUrl('https://example.com/x.png')).toBeNull();
  });
});

describe('isRegionTooSmall', () => {
  it('rejects a drag whose width is under the minimum', () => {
    expect(isRegionTooSmall({ x: 0, y: 0, width: 7, height: 100 })).toBe(true);
  });

  it('rejects a drag whose height is under the minimum', () => {
    expect(isRegionTooSmall({ x: 0, y: 0, width: 100, height: 7 })).toBe(true);
  });

  it('accepts a drag meeting the minimum on both edges', () => {
    expect(isRegionTooSmall({ x: 0, y: 0, width: 8, height: 8 })).toBe(false);
  });
});
