/**
 * Single source of truth for product naming.
 * Working name only — finalized at T5.3 before store submission.
 * Never hardcode the product name elsewhere; import BRAND instead.
 */
export const BRAND = {
  /** Display name used in manifest and UI headings. */
  name: 'LLM Translate',
  /** Store title (keyword-rich); finalized before submission. */
  storeTitle: 'LLM Translate: Selection & Page Translator',
} as const;
