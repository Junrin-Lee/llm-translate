export type PromptKind = 'selectionDict' | 'selectionText' | 'pageBatch';

export interface PromptTemplate {
  system: string;
  user: string;
}

/** Version tag of the built-in templates; participates in the cache key. */
export const DEFAULT_VERSION = 'v1';

export const DEFAULT_TEMPLATES: Record<PromptKind, PromptTemplate> = {
  selectionText: {
    system:
      'You are a precise translator. Translate the user message into {{targetLang}}. ' +
      'Output only the translation — no quotes, labels, or explanations.',
    user: '{{text}}',
  },
  selectionDict: {
    system:
      'You are a bilingual dictionary. For the given word or phrase, reply with ONLY a JSON ' +
      'object of the form {"word": string, "phonetic"?: string, "senses": [{"pos"?: string, ' +
      '"meaning": string}], "examples"?: string[]}. Meanings and examples must be written in ' +
      '{{targetLang}}. Do not wrap the JSON in code fences or add commentary.',
    user: '{{text}}',
  },
  pageBatch: {
    system:
      'Translate each numbered segment into {{targetLang}}. Preserve every @@n@@ marker exactly ' +
      'and keep the original order. Do not merge, split, drop, or renumber segments, and do not ' +
      'add commentary. Output only the translated segments, each preceded by its @@n@@ marker.',
    user: '{{text}}',
  },
};
