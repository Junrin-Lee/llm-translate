# 0003 — The Screenshot Translation result card cannot be dragged and covers the original

**English** · [简体中文](./0003-image-result-panel-not-draggable.zh-CN.md)

- **Reported:** 2026-07-15, during the Screenshot Translation smoke pass
- **Status:** Fixed
- **Fix verified:** new E2E `e2e/image-drag.spec.ts` (red → green), full gate re-run

## Symptom

After confirming a crop, the streaming result card appears fixed at the viewport center-top
(`left: 50%; top: 20%`) and cannot be moved. On text-dense pages the card sits directly on top
of the original content the user is trying to compare against. The Selection Translation popup
supports drag-to-move; the Screenshot Translation card did not.

## Diagnosis

Not a missing capability — a missing wire. The shared drag hook
[`useDrag`](../../src/ui/useDrag.ts) already powers `TranslatePanel` (selection popup) and
`PageToolbar`, but [`ImageResultPanel`](../../src/ui/image/ImageResultPanel.tsx) never attached
it: the header had no pointer handler, and the root element carried no ref or style override.

One extra trap specific to this panel: `.llmt-image-panel` centers itself with
`left: 50%` + `transform: translateX(-50%)`. `useDrag` measures the element's *visual*
position via `getBoundingClientRect()`, so applying only dragged `left`/`top` coordinates
while the transform remains would make the panel jump half its own width on the first drag.

## Fix

Mirror the `TranslatePanel` wiring inside `ImageResultPanel` (commit on this branch):

- attach `useDrag` via a root ref; drag starts from the header (`onPointerDown`), with clicks
  on buttons excluded (`closest('button')`) so the close button keeps working;
- once dragged, override the position with `{ left, top, transform: 'none' }` — clearing the
  centering transform avoids the half-width jump;
- the title span (`.llmt-panel__grip`) already carries the shared `cursor: grab` styling and
  now gets the `toolbarDrag` tooltip.

Both hosts render the same component, so the in-place card (content script) and the workbench
page are fixed together.

## Verification

- New `e2e/image-drag.spec.ts`: workbench → upload → crop → drag the header, asserting the
  panel moved > 80 px on both axes. Written first against the unfixed build (moved 0 px, red),
  green after the fix.
- Full gate: 210 unit tests, `typecheck`, `lint` (baseline warning only), all 5 Playwright
  specs pass, including the `selection-drag` regression.
