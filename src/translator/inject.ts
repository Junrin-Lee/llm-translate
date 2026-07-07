const MARK = 'data-llmt';
const SRC_MARK = 'data-llmt-src';
const ORIG_MARK = 'data-llmt-orig';
const REPLACE_CLASS = 'llmt-mode-replace';
const STYLE_ID = 'llmt-page-style';

const PAGE_CSS = `
[${MARK}]{display:block;margin-top:.3em;line-height:1.5;}
[${MARK}].llmt-loading{
  height:1em;width:min(45%,14em);border-radius:4px;
  background:linear-gradient(90deg,rgba(128,128,128,.12) 25%,rgba(128,128,128,.28) 37%,rgba(128,128,128,.12) 63%);
  background-size:400% 100%;animation:llmt-shimmer 1.4s ease infinite;
}
[${MARK}].llmt-error{color:#c0392b;font-size:.9em;}
[${ORIG_MARK}]{display:contents;}
.${REPLACE_CLASS} [${ORIG_MARK}]{display:none;}
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

function childWith(element: Element, attr: string): Element | undefined {
  return Array.from(element.children).find((child) => child.hasAttribute(attr));
}

/**
 * Get (or create) the translation node under `element`. On first creation the
 * original content is moved into a display:contents wrapper so "translation
 * only" mode can hide it without losing it.
 */
function nodeFor(element: Element): Element {
  const existing = childWith(element, MARK);
  if (existing) return existing;

  const doc = element.ownerDocument;
  const wrapper = doc.createElement('span');
  wrapper.setAttribute(ORIG_MARK, '1');
  while (element.firstChild) wrapper.appendChild(element.firstChild);
  element.appendChild(wrapper);

  const node = doc.createElement('div');
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

/** Toggle "translation only" mode (hides the original via the wrapper). */
export function setReplaceMode(replace: boolean): void {
  document.documentElement.classList.toggle(REPLACE_CLASS, replace);
}

export function isPageTranslated(root: ParentNode): boolean {
  return root.querySelector(`[${MARK}]`) !== null;
}

/** Remove injected nodes, unwrap originals, and reset mode; return elements restored. */
export function restorePage(root: ParentNode): number {
  const elements = root.querySelectorAll(`[${SRC_MARK}]`);
  for (const element of elements) {
    const wrapper = childWith(element, ORIG_MARK);
    if (wrapper) {
      while (wrapper.firstChild) element.insertBefore(wrapper.firstChild, wrapper);
      wrapper.remove();
    }
    childWith(element, MARK)?.remove();
    element.removeAttribute(SRC_MARK);
  }
  document.documentElement.classList.remove(REPLACE_CLASS);
  return elements.length;
}
