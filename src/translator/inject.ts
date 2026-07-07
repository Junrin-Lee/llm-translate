const MARK = 'data-llmt';
const SRC_MARK = 'data-llmt-src';

function existingTranslation(element: Element): Element | undefined {
  return Array.from(element.children).find((child) => child.hasAttribute(MARK));
}

/**
 * Append a bilingual translation node under `element` (or update it if already
 * present). The translation is written with textContent — LLM output is
 * untrusted and must never be parsed as HTML.
 */
export function injectTranslation(element: Element, text: string): void {
  const current = existingTranslation(element);
  if (current) {
    current.textContent = text;
    return;
  }
  const node = element.ownerDocument.createElement('div');
  node.setAttribute(MARK, '1');
  node.setAttribute('dir', 'auto');
  node.style.cssText = 'display:block;margin-top:0.3em;';
  node.textContent = text;
  element.appendChild(node);
  element.setAttribute(SRC_MARK, '1');
}

export function isPageTranslated(root: ParentNode): boolean {
  return root.querySelector(`[${MARK}]`) !== null;
}

/** Remove all injected translation nodes and source markers; return the count removed. */
export function restorePage(root: ParentNode): number {
  const injected = root.querySelectorAll(`[${MARK}]`);
  for (const node of injected) node.remove();
  for (const el of root.querySelectorAll(`[${SRC_MARK}]`)) el.removeAttribute(SRC_MARK);
  return injected.length;
}
