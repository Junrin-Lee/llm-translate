// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  finalizeErrors,
  injectPlaceholder,
  injectTranslation,
  isPageTranslated,
  restorePage,
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
