/** Selections longer than this are never auto-translated on selection. */
export const MAX_SELECTION_CHARS = 2000;

export function exceedsSelectionLimit(text: string): boolean {
  return text.length > MAX_SELECTION_CHARS;
}

// Sentence-ending marks in Latin and CJK scripts.
const SENTENCE_PUNCT = /[.!?。！？…]/u;
const TRAILING_PUNCT = /[.!?。！？…]+$/u;
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/gu;

/**
 * Decide whether a selection should render as a dictionary card (a word or
 * short phrase) or a translation card (a sentence or longer). This is only the
 * default — the panel lets the user flip between the two.
 */
export function classifySelection(text: string): 'dict' | 'text' {
  const trimmed = text.trim();
  if (!trimmed) return 'text';

  // Drop trailing punctuation (so "Hello!" is still a single word), then any
  // remaining sentence punctuation signals a real sentence.
  const core = trimmed.replace(TRAILING_PUNCT, '').trim();
  if (SENTENCE_PUNCT.test(core)) return 'text';

  const cjkCount = (core.match(CJK) ?? []).length;
  if (cjkCount > 0) return cjkCount <= 4 ? 'dict' : 'text';

  const words = core.split(/\s+/).filter(Boolean);
  return words.length <= 3 ? 'dict' : 'text';
}
