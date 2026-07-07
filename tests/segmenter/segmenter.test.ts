// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { collectSegments } from '@/segmenter';

function segment(html: string) {
  document.body.innerHTML = html;
  return collectSegments(document.body);
}

describe('collectSegments', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collects block-level paragraphs with normalized text and sequential ids', () => {
    const segs = segment('<p>Hello   world</p><p>Second\nparagraph</p>');
    expect(segs.map((s) => s.text)).toEqual(['Hello world', 'Second paragraph']);
    expect(segs.map((s) => s.id)).toEqual([0, 1]);
    expect(segs[0].element.tagName).toBe('P');
  });

  it('collects headings, list items and table cells', () => {
    const segs = segment(
      '<h1>Title</h1><ul><li>one</li><li>two</li></ul><table><tr><td>cell</td></tr></table>',
    );
    expect(segs.map((s) => s.text)).toEqual(['Title', 'one', 'two', 'cell']);
  });

  it('skips code, pre, script and style', () => {
    const segs = segment(
      '<pre>const x = 1;</pre><p>real text</p><script>alert(1)</script><style>.a{}</style>',
    );
    expect(segs.map((s) => s.text)).toEqual(['real text']);
  });

  it('takes the leaf block, not an ancestor that contains blocks', () => {
    const segs = segment('<blockquote><p>quoted line</p></blockquote>');
    expect(segs).toHaveLength(1);
    expect(segs[0].element.tagName).toBe('P');
    expect(segs[0].text).toBe('quoted line');
  });

  it('keeps a paragraph with an inline link', () => {
    const segs = segment('<p>Visit <a href="https://x.com">our site</a> today</p>');
    expect(segs.map((s) => s.text)).toEqual(['Visit our site today']);
  });

  it('skips bare-URL and pure-number blocks', () => {
    const segs = segment('<p>https://example.com/page</p><p>2,500</p><p>Actual words</p>');
    expect(segs.map((s) => s.text)).toEqual(['Actual words']);
  });

  it('skips content inside a contenteditable region', () => {
    const segs = segment('<div contenteditable="true"><p>editing</p></div><p>outside</p>');
    expect(segs.map((s) => s.text)).toEqual(['outside']);
  });

  it('skips empty and whitespace-only blocks', () => {
    const segs = segment('<p>   </p><p></p><p>content</p>');
    expect(segs.map((s) => s.text)).toEqual(['content']);
  });

  it('skips blocks hidden with display:none', () => {
    const segs = segment('<p style="display:none">hidden</p><p>shown</p>');
    expect(segs.map((s) => s.text)).toEqual(['shown']);
  });

  it('skips already-injected translation nodes', () => {
    const segs = segment('<p>source</p><p data-llmt="1">译文</p>');
    expect(segs.map((s) => s.text)).toEqual(['source']);
  });
});
