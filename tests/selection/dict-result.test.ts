import { describe, expect, it } from 'vitest';
import { parseDictResult } from '@/selection/dict-result';

describe('parseDictResult', () => {
  it('parses a well-formed dictionary JSON object', () => {
    const raw = JSON.stringify({
      word: 'run',
      phonetic: '/rʌn/',
      senses: [{ pos: 'verb', meaning: '跑' }],
      examples: ['I run every day.'],
    });
    expect(parseDictResult(raw)).toEqual({
      word: 'run',
      phonetic: '/rʌn/',
      senses: [{ pos: 'verb', meaning: '跑' }],
      examples: ['I run every day.'],
    });
  });

  it('tolerates a ```json code fence', () => {
    const raw = '```json\n{"word":"cat","senses":[{"meaning":"猫"}]}\n```';
    expect(parseDictResult(raw)?.word).toBe('cat');
  });

  it('extracts the JSON object even with surrounding prose', () => {
    const raw = 'Sure! Here it is:\n{"word":"dog","senses":[{"meaning":"狗"}]}\nHope that helps.';
    expect(parseDictResult(raw)?.senses[0]?.meaning).toBe('狗');
  });

  it('drops senses without a meaning and omits empty examples', () => {
    const raw = '{"word":"x","senses":[{"meaning":"m"},{"pos":"noun"}],"examples":[]}';
    const result = parseDictResult(raw);
    expect(result?.senses).toEqual([{ meaning: 'm', pos: undefined }]);
    expect(result?.examples).toBeUndefined();
  });

  it('returns null for non-JSON text', () => {
    expect(parseDictResult('just a plain translation')).toBeNull();
  });

  it('returns null when there is no word', () => {
    expect(parseDictResult('{"senses":[{"meaning":"m"}]}')).toBeNull();
  });

  it('returns null when there are no usable senses', () => {
    expect(parseDictResult('{"word":"x","senses":[]}')).toBeNull();
  });
});
