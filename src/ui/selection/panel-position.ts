/** Geometry for placing the selection panel near a selection without overflow. */

export interface PanelAnchorRect {
  top: number;
  bottom: number;
  left: number;
}

export interface PanelPlacement {
  /** Clamped left offset (px). */
  left: number;
  /** Which viewport edge `offset` is measured from. */
  anchor: 'top' | 'bottom';
  /** Distance from that edge (px). */
  offset: number;
  /** Max height for the scrollable body so the whole panel fits the viewport. */
  bodyMaxHeight: number;
}

export const PANEL_WIDTH = 360;
const GAP = 8; // gap between the selection and the panel
const EDGE = 8; // minimum gap to the viewport edge
const CHROME = 96; // header + footer height allowance
const BODY_MIN = 96;
const BODY_MAX = 320;

function clampBody(space: number): number {
  return Math.max(BODY_MIN, Math.min(BODY_MAX, space - CHROME));
}

/**
 * Decide where the panel opens for a given selection rect: on whichever side
 * (above/below) has more room, left-clamped to the viewport, with the body
 * height capped so the panel never runs off-screen.
 */
export function computePanelPlacement(
  rect: PanelAnchorRect,
  viewportWidth: number,
  viewportHeight: number,
): PanelPlacement {
  const left = Math.max(EDGE, Math.min(rect.left, viewportWidth - PANEL_WIDTH - EDGE));
  const spaceBelow = viewportHeight - rect.bottom - GAP - EDGE;
  const spaceAbove = rect.top - GAP - EDGE;
  const openDown = spaceBelow >= spaceAbove;
  const bodyMaxHeight = clampBody(Math.max(openDown ? spaceBelow : spaceAbove, 0));
  return openDown
    ? { left, anchor: 'top', offset: rect.bottom + GAP, bodyMaxHeight }
    : { left, anchor: 'bottom', offset: viewportHeight - rect.top + GAP, bodyMaxHeight };
}

/** Body max-height for a panel whose top edge sits at `topY` (after dragging). */
export function bodyMaxHeightAt(topY: number, viewportHeight: number): number {
  return clampBody(viewportHeight - topY - EDGE);
}
