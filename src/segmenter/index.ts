export interface Segment {
  id: number;
  element: Element;
  text: string;
}

// Block-level elements that carry translatable prose.
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, td, blockquote, dd, figcaption';
// Never translate inside these, and never re-collect our own injected nodes.
const SKIP_SELECTOR =
  'script, style, code, pre, textarea, [contenteditable="true"], [contenteditable=""], [data-llmt]';

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function isTranslatable(text: string): boolean {
  if (text.length < 2) return false;
  if (!/\p{L}/u.test(text)) return false; // needs at least one letter (Latin or CJK)
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(text)) return false; // a bare URL
  return true;
}

function isHidden(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true;
  const inline = (element as HTMLElement).style;
  if (inline && (inline.display === 'none' || inline.visibility === 'hidden')) return true;
  const view = element.ownerDocument?.defaultView;
  if (view?.getComputedStyle) {
    const style = view.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  }
  return false;
}

/**
 * Collect translatable block elements under `root`. Each returned Segment is a
 * leaf block (contains no other block) with normalized text, so it maps 1:1 to
 * a DOM element for later injection. Batching of segments into LLM requests is
 * the orchestrator's job, not this function's.
 */
export function collectSegments(root: ParentNode): Segment[] {
  const segments: Segment[] = [];
  let id = 0;

  for (const element of root.querySelectorAll(BLOCK_SELECTOR)) {
    if (element.closest(SKIP_SELECTOR)) continue;
    if (element.querySelector(BLOCK_SELECTOR)) continue; // not a leaf block
    if (isHidden(element)) continue;

    const text = normalizeText(element.textContent ?? '');
    if (!isTranslatable(text)) continue;

    segments.push({ id, element, text });
    id += 1;
  }

  return segments;
}
