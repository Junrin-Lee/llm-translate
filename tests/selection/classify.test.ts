import { describe, expect, it } from 'vitest';
import {
  classifySelection,
  exceedsSelectionLimit,
  MAX_SELECTION_CHARS,
} from '@/selection/classify';

describe('classifySelection', () => {
  it('treats a single word as a dictionary lookup', () => {
    expect(classifySelection('serendipity')).toBe('dict');
  });

  it('treats a short phrase (<=3 words) as a dictionary lookup', () => {
    expect(classifySelection('machine learning model')).toBe('dict');
  });

  it('treats a longer phrase as text', () => {
    expect(classifySelection('the quick brown fox jumps')).toBe('text');
  });

  it('treats a sentence with terminal punctuation as text', () => {
    expect(classifySelection('This is a full sentence.')).toBe('text');
  });

  it('ignores trailing punctuation on a single word', () => {
    expect(classifySelection('Hello!')).toBe('dict');
  });

  it('treats internal sentence punctuation as text', () => {
    expect(classifySelection('Wait. Stop now')).toBe('text');
  });

  it('treats a short CJK selection as a dictionary lookup', () => {
    expect(classifySelection('机器学习')).toBe('dict');
  });

  it('treats a long CJK selection as text', () => {
    expect(classifySelection('这是一个用于测试的中文句子')).toBe('text');
  });

  it('handles a single CJK word', () => {
    expect(classifySelection('你好')).toBe('dict');
  });

  it('defaults empty input to text', () => {
    expect(classifySelection('   ')).toBe('text');
  });
});

describe('exceedsSelectionLimit', () => {
  it('is false for normal selections', () => {
    expect(exceedsSelectionLimit('hello world')).toBe(false);
  });

  it('is true beyond the max length', () => {
    expect(exceedsSelectionLimit('a'.repeat(MAX_SELECTION_CHARS + 1))).toBe(true);
  });

  it('is false exactly at the limit', () => {
    expect(exceedsSelectionLimit('a'.repeat(MAX_SELECTION_CHARS))).toBe(false);
  });
});
