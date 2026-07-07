export interface BatchItem {
  id: number;
  text: string;
}

const MARKER = /@@(\d+)@@/g;

/**
 * Encode segments into a single prompt payload, each preceded by an @@id@@
 * marker. The model is instructed (pageBatch prompt) to keep the markers so
 * decodeBatch can map translations back to segments.
 */
export function encodeBatch(items: BatchItem[]): string {
  return items.map((item) => `@@${item.id}@@\n${item.text}`).join('\n\n');
}

/**
 * Parse a batch response into id -> translated text. Tolerant of out-of-order
 * markers, junk before the first marker, inline markers, and missing ids (a
 * dropped id is simply absent, so the caller keeps the original text).
 */
export function decodeBatch(raw: string): Map<number, string> {
  const result = new Map<number, string>();
  const markers = [...raw.matchAll(MARKER)];

  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    if (marker.index === undefined) continue;
    const id = Number(marker[1]);
    const start = marker.index + marker[0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index : raw.length;
    result.set(id, raw.slice(start, end).trim());
  }

  return result;
}
