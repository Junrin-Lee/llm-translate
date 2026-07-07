import { describe, expect, it } from 'vitest';
import { decodeBatch, encodeBatch } from '@/translator/batch';

describe('encodeBatch', () => {
  it('prefixes each segment with an @@id@@ marker', () => {
    const out = encodeBatch([
      { id: 0, text: 'Hello' },
      { id: 1, text: 'World' },
    ]);
    expect(out).toBe('@@0@@\nHello\n\n@@1@@\nWorld');
  });
});

describe('decodeBatch', () => {
  it('parses markers into an id -> text map', () => {
    const map = decodeBatch('@@0@@\nBonjour\n\n@@1@@\nMonde');
    expect(map.get(0)).toBe('Bonjour');
    expect(map.get(1)).toBe('Monde');
  });

  it('tolerates out-of-order markers', () => {
    const map = decodeBatch('@@1@@\nB\n\n@@0@@\nA');
    expect(map.get(0)).toBe('A');
    expect(map.get(1)).toBe('B');
  });

  it('keeps only the ids the model returned (missing ids absent)', () => {
    const map = decodeBatch('@@0@@\nonly this');
    expect(map.get(0)).toBe('only this');
    expect(map.has(1)).toBe(false);
    expect(map.size).toBe(1);
  });

  it('ignores junk before the first marker', () => {
    const map = decodeBatch('Here are the translations:\n@@0@@\nA');
    expect(map.get(0)).toBe('A');
  });

  it('accepts a marker inline with its text', () => {
    const map = decodeBatch('@@0@@ Bonjour');
    expect(map.get(0)).toBe('Bonjour');
  });

  it('preserves internal newlines within a segment', () => {
    const map = decodeBatch('@@0@@\nline one\nline two\n\n@@1@@\nx');
    expect(map.get(0)).toBe('line one\nline two');
    expect(map.get(1)).toBe('x');
  });

  it('round-trips with encodeBatch', () => {
    const items = [
      { id: 0, text: 'first' },
      { id: 1, text: 'second' },
    ];
    const map = decodeBatch(encodeBatch(items));
    expect(map.get(0)).toBe('first');
    expect(map.get(1)).toBe('second');
  });
});
