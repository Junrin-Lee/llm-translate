/**
 * Single source of truth for product naming. Finalized name: "LLM Translate".
 * Never hardcode the product name elsewhere; import BRAND instead.
 */
export const BRAND = {
  /** Display name used in manifest and UI headings. */
  name: 'LLM Translate',
  /** Store listing title (keyword-rich). */
  storeTitle: 'LLM Translate: Selection & Page Translator',
} as const;
