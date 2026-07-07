const MARK = 'data-llmt';
const SRC_MARK = 'data-llmt-src';
const STYLE_ID = 'llmt-page-style';

const PAGE_CSS = `
[${MARK}]{display:block;margin-top:.3em;line-height:1.5;}
[${MARK}].llmt-loading{
  height:1em;width:min(45%,14em);border-radius:4px;
  background:linear-gradient(90deg,rgba(128,128,128,.12) 25%,rgba(128,128,128,.28) 37%,rgba(128,128,128,.12) 63%);
  background-size:400% 100%;animation:llmt-shimmer 1.4s ease infinite;
}
[${MARK}].llmt-error{color:#c0392b;font-size:.9em;}
@keyframes llmt-shimmer{0%{background-position:100% 50%}100%{background-position:0 50%}}
@media (prefers-reduced-motion:reduce){[${MARK}].llmt-loading{animation:none;opacity:.5}}
`;

function ensurePageStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PAGE_CSS;
  doc.head.appendChild(style);
}

function existingNode(element: Element): Element | undefined {
  return Array.from(element.children).find((child) => child.hasAttribute(MARK));
}

function nodeFor(element: Element): Element {
  const current = existingNode(element);
  if (current) return current;
  const node = element.ownerDocument.createElement('div');
  node.setAttribute(MARK, '1');
  node.setAttribute('dir', 'auto');
  element.appendChild(node);
  element.setAttribute(SRC_MARK, '1');
  return node;
}

/** Show a shimmering placeholder under the element while its batch is in flight. */
export function injectPlaceholder(element: Element): void {
  ensurePageStyles(element.ownerDocument);
  const node = nodeFor(element);
  node.classList.add('llmt-loading');
  node.textContent = '';
}

/**
 * Write the translation under the element (create-or-update). textContent only —
 * LLM output is untrusted and must never be parsed as HTML.
 */
export function injectTranslation(element: Element, text: string): void {
  ensurePageStyles(element.ownerDocument);
  const node = nodeFor(element);
  node.classList.remove('llmt-loading', 'llmt-error');
  node.textContent = text;
}

/** Turn any still-pending placeholders under root into a small error marker. */
export function finalizeErrors(root: ParentNode): void {
  for (const node of root.querySelectorAll(`[${MARK}].llmt-loading`)) {
    node.classList.remove('llmt-loading');
    node.classList.add('llmt-error');
    node.textContent = '⚠';
    (node as HTMLElement).title = 'Translation failed';
  }
}

export function isPageTranslated(root: ParentNode): boolean {
  return root.querySelector(`[${MARK}]`) !== null;
}

/** Remove all injected nodes and source markers; return the count removed. */
export function restorePage(root: ParentNode): number {
  const injected = root.querySelectorAll(`[${MARK}]`);
  for (const node of injected) node.remove();
  for (const el of root.querySelectorAll(`[${SRC_MARK}]`)) el.removeAttribute(SRC_MARK);
  return injected.length;
}
