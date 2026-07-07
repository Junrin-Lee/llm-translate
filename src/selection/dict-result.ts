export interface DictSense {
  pos?: string;
  meaning: string;
}

export interface DictResult {
  word: string;
  phonetic?: string;
  senses: DictSense[];
  examples?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

function tryParseJson(raw: string): unknown {
  const stripped = stripFences(raw).trim();
  try {
    return JSON.parse(stripped);
  } catch {
    /* not directly parseable — try to extract an object below */
  }
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* give up */
    }
  }
  return null;
}

/**
 * Parse a dictionary-card JSON payload from the model, tolerating code fences
 * and surrounding prose. Returns null when the text isn't a usable dictionary
 * object, so the caller can fall back to rendering it as plain text.
 */
export function parseDictResult(raw: string): DictResult | null {
  const parsed = tryParseJson(raw);
  if (!isRecord(parsed) || typeof parsed.word !== 'string' || !Array.isArray(parsed.senses)) {
    return null;
  }

  const senses: DictSense[] = parsed.senses
    .filter(isRecord)
    .map((sense) => ({
      meaning: typeof sense.meaning === 'string' ? sense.meaning : '',
      pos: typeof sense.pos === 'string' ? sense.pos : undefined,
    }))
    .filter((sense) => sense.meaning.length > 0);
  if (senses.length === 0) return null;

  const result: DictResult = { word: parsed.word, senses };
  if (typeof parsed.phonetic === 'string') result.phonetic = parsed.phonetic;
  if (Array.isArray(parsed.examples)) {
    const examples = parsed.examples.filter((e): e is string => typeof e === 'string');
    if (examples.length > 0) result.examples = examples;
  }
  return result;
}
