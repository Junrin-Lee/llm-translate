import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '@/selection/markdown';

const text = (t: string) => ({ type: 'text', text: t });

describe('parseMarkdown', () => {
  it('splits paragraphs on blank lines', () => {
    expect(parseMarkdown('First para.\n\nSecond para.')).toEqual([
      { type: 'paragraph', children: [text('First para.')] },
      { type: 'paragraph', children: [text('Second para.')] },
    ]);
  });

  it('turns consecutive bullet or numbered lines into a list', () => {
    expect(parseMarkdown('Sources:\n- one\n* two\n\n1. first\n2) second')).toEqual([
      { type: 'paragraph', children: [text('Sources:')] },
      { type: 'list', ordered: false, items: [[text('one')], [text('two')]] },
      { type: 'list', ordered: true, items: [[text('first')], [text('second')]] },
    ]);
  });

  it('parses bold, inline code and links inside a line', () => {
    expect(parseMarkdown('**WXT** is a `vite` tool, see [docs](https://wxt.dev).')).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'strong', children: [text('WXT')] },
          text(' is a '),
          { type: 'code', text: 'vite' },
          text(' tool, see '),
          { type: 'link', href: 'https://wxt.dev', children: [text('docs')] },
          text('.'),
        ],
      },
    ]);
  });

  it('keeps a non-http(s) link as its plain label so javascript: never becomes an href', () => {
    expect(parseMarkdown('[click](javascript:alert(1)) and [mail](mailto:a@b.c)')).toEqual([
      { type: 'paragraph', children: [text('click'), text(' and '), text('mail')] },
    ]);
  });

  it('leaves raw HTML as literal text', () => {
    expect(parseMarkdown('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'paragraph', children: [text('<img src=x onerror=alert(1)>')] },
    ]);
  });

  it('renders a heading as its own bold paragraph instead of leaking # marks', () => {
    expect(parseMarkdown('## Overview\nWXT builds extensions.')).toEqual([
      { type: 'paragraph', children: [{ type: 'strong', children: [text('Overview')] }] },
      { type: 'paragraph', children: [text('WXT builds extensions.')] },
    ]);
  });
});
