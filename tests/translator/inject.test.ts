// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  collectErroredElements,
  countErrored,
  erroredSourceOf,
  finalizeErrors,
  injectPlaceholder,
  injectTranslation,
  isPageTranslated,
  restorePage,
  setReplaceMode,
} from '@/translator/inject';

describe('injectTranslation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('appends a marked translation node under the element', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const p = document.querySelector('p')!;
    injectTranslation(p, '你好');

    const tr = p.querySelector('[data-llmt]');
    expect(tr?.textContent).toBe('你好');
    expect(p.textContent).toContain('Hello');
    expect(p.textContent).toContain('你好');
  });

  it('is idempotent — re-injecting updates in place, no duplicates', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const p = document.querySelector('p')!;
    injectTranslation(p, '你好');
    injectTranslation(p, '您好');

    expect(p.querySelectorAll('[data-llmt]')).toHaveLength(1);
    expect(p.querySelector('[data-llmt]')?.textContent).toBe('您好');
  });

  it('writes the translation as text, never as HTML (XSS-safe)', () => {
    document.body.innerHTML = '<p>x</p>';
    const p = document.querySelector('p')!;
    injectTranslation(p, '<img src=x onerror=alert(1)>');

    const tr = p.querySelector('[data-llmt]');
    expect(tr?.querySelector('img')).toBeNull();
    expect(tr?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('restorePage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('removes every injected node and reports the count', () => {
    document.body.innerHTML = '<p>a</p><p>b</p>';
    for (const p of document.querySelectorAll('p')) injectTranslation(p, 'T');

    expect(isPageTranslated(document.body)).toBe(true);
    const removed = restorePage(document.body);

    expect(removed).toBe(2);
    expect(document.querySelectorAll('[data-llmt]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-llmt-src]')).toHaveLength(0);
    expect(document.body.textContent).toBe('ab');
    expect(isPageTranslated(document.body)).toBe(false);
  });
});

describe('loading & error states', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('injectPlaceholder marks a pending, empty loading node', () => {
    document.body.innerHTML = '<p>Hi</p>';
    const p = document.querySelector('p')!;
    injectPlaceholder(p);

    const node = p.querySelector('[data-llmt]')!;
    expect(node.classList.contains('llmt-loading')).toBe(true);
    expect(node.textContent).toBe('');
  });

  it('injectTranslation clears the loading state in place', () => {
    document.body.innerHTML = '<p>Hi</p>';
    const p = document.querySelector('p')!;
    injectPlaceholder(p);
    injectTranslation(p, '你好');

    const node = p.querySelector('[data-llmt]')!;
    expect(node.classList.contains('llmt-loading')).toBe(false);
    expect(node.textContent).toBe('你好');
    expect(p.querySelectorAll('[data-llmt]')).toHaveLength(1);
  });

  it('finalizeErrors converts leftover placeholders into an error marker', () => {
    document.body.innerHTML = '<p>a</p><p>b</p>';
    const [p1, p2] = document.querySelectorAll('p');
    injectPlaceholder(p1!);
    injectPlaceholder(p2!);
    injectTranslation(p1!, 'done'); // p1 resolved, p2 left pending

    finalizeErrors(document.body);

    expect(p1!.querySelector('[data-llmt]')?.classList.contains('llmt-error')).toBe(false);
    expect(p2!.querySelector('[data-llmt]')?.classList.contains('llmt-error')).toBe(true);
  });
});

describe('translation-only mode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });

  it('wraps the original content so it can be hidden and restored', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const p = document.querySelector('p')!;
    injectTranslation(p, '你好');

    const wrapper = p.querySelector('[data-llmt-orig]');
    expect(wrapper?.textContent).toBe('Hello');

    restorePage(document.body);
    expect(p.textContent).toBe('Hello');
    expect(p.querySelector('[data-llmt-orig]')).toBeNull();
  });

  it('toggles the replace-mode class on the document element', () => {
    setReplaceMode(true);
    expect(document.documentElement.classList.contains('llmt-mode-replace')).toBe(true);
    setReplaceMode(false);
    expect(document.documentElement.classList.contains('llmt-mode-replace')).toBe(false);
  });

  it('clears the replace-mode class on restore', () => {
    document.body.innerHTML = '<p>x</p>';
    injectTranslation(document.querySelector('p')!, 'y');
    setReplaceMode(true);
    restorePage(document.body);
    expect(document.documentElement.classList.contains('llmt-mode-replace')).toBe(false);
  });
});

describe('retry helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  // p0 resolves; p1 and p2 are left errored.
  function makeErrored(): HTMLParagraphElement[] {
    document.body.innerHTML = '<p>a</p><p>b</p><p>c</p>';
    const ps = [...document.querySelectorAll('p')];
    for (const p of ps) injectPlaceholder(p);
    injectTranslation(ps[0]!, 'done');
    finalizeErrors(document.body, 'Click to retry');
    return ps;
  }

  it('counts and collects the errored segments', () => {
    const ps = makeErrored();
    expect(countErrored(document.body)).toBe(2);

    const errored = collectErroredElements(document.body);
    expect(errored).toHaveLength(2);
    expect(errored).toContain(ps[1]);
    expect(errored).toContain(ps[2]);
  });

  it('finalizeErrors applies the retry hint as the marker title', () => {
    makeErrored();
    const node = document.querySelector('[data-llmt].llmt-error') as HTMLElement;
    expect(node.title).toBe('Click to retry');
  });

  it('injectPlaceholder resets an errored node back to loading (retry path)', () => {
    const ps = makeErrored();
    injectPlaceholder(ps[1]!);

    const node = ps[1]!.querySelector('[data-llmt]')!;
    expect(node.classList.contains('llmt-error')).toBe(false);
    expect(node.classList.contains('llmt-loading')).toBe(true);
    expect(countErrored(document.body)).toBe(1);
  });

  it('erroredSourceOf maps a click inside an error marker to its segment', () => {
    const ps = makeErrored();
    const errorNode = ps[2]!.querySelector('[data-llmt].llmt-error')!;
    expect(erroredSourceOf(errorNode)).toBe(ps[2]);

    // A resolved node (or nothing) is not a retry target.
    expect(erroredSourceOf(ps[0]!.querySelector('[data-llmt]'))).toBeNull();
    expect(erroredSourceOf(null)).toBeNull();
  });
});
