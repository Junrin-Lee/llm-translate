import { describe, expect, it } from 'vitest';
import { bodyMaxHeightAt, computePanelPlacement, PANEL_WIDTH } from '@/ui/selection/panel-position';

const VW = 1000;
const VH = 800;

describe('computePanelPlacement', () => {
  it('opens downward when the selection sits high (more room below)', () => {
    const p = computePanelPlacement({ top: 100, bottom: 120, left: 200 }, VW, VH);
    expect(p.anchor).toBe('top');
    expect(p.offset).toBe(128); // bottom + gap
  });

  it('opens upward when the selection sits low (more room above)', () => {
    const p = computePanelPlacement({ top: 700, bottom: 720, left: 200 }, VW, VH);
    expect(p.anchor).toBe('bottom');
    expect(p.offset).toBe(VH - 700 + 8);
  });

  it('clamps left within the viewport on both edges', () => {
    expect(computePanelPlacement({ top: 100, bottom: 120, left: 980 }, VW, VH).left).toBe(
      VW - PANEL_WIDTH - 8,
    );
    expect(computePanelPlacement({ top: 100, bottom: 120, left: -50 }, VW, VH).left).toBe(8);
  });

  it('keeps the body height within [96, 320] whatever the room', () => {
    const tight = computePanelPlacement({ top: 360, bottom: 400, left: 10 }, VW, 480);
    expect(tight.bodyMaxHeight).toBeGreaterThanOrEqual(96);
    expect(tight.bodyMaxHeight).toBeLessThanOrEqual(320);

    const roomy = computePanelPlacement({ top: 40, bottom: 60, left: 10 }, VW, 2000);
    expect(roomy.bodyMaxHeight).toBe(320);
  });
});

describe('bodyMaxHeightAt', () => {
  it('shrinks as the panel is dragged lower', () => {
    expect(bodyMaxHeightAt(50, 800)).toBeGreaterThan(bodyMaxHeightAt(600, 800));
  });

  it('never drops below the floor', () => {
    expect(bodyMaxHeightAt(790, 800)).toBe(96);
  });
});
