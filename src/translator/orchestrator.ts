import { type BatchItem, decodeBatch, encodeBatch } from './batch';

export type TranslateBatchFn = (payload: string, signal: AbortSignal) => Promise<string>;

export interface PageTranslateController {
  cancel(): void;
  pause(): void;
  resume(): void;
}

export interface TranslateSegmentsOptions {
  /** Sends one encoded batch to the model and resolves with the raw response. */
  translate: TranslateBatchFn;
  /** Max concurrent batches in flight (default 3). */
  concurrency?: number;
  /** Approximate character budget per batch (default 1500). */
  maxBatchChars?: number;
  onResult: (id: number, text: string) => void;
  onProgress: (done: number, total: number) => void;
  onError: (error: unknown) => void;
}

/** Greedily pack items into batches under a character budget (>=1 item each). */
function groupIntoBatches(items: BatchItem[], maxChars: number): BatchItem[][] {
  const batches: BatchItem[][] = [];
  let current: BatchItem[] = [];
  let length = 0;
  for (const item of items) {
    if (current.length > 0 && length + item.text.length > maxChars) {
      batches.push(current);
      current = [];
      length = 0;
    }
    current.push(item);
    length += item.text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Translate page segments in batches with bounded concurrency. Each batch is
 * retried once on failure; a dropped id is left untranslated. Progress counts
 * every attempted segment so it always reaches total. Returns a controller to
 * pause/resume/cancel.
 */
export function translateSegments(
  items: BatchItem[],
  opts: TranslateSegmentsOptions,
): PageTranslateController {
  const { translate, onResult, onProgress, onError } = opts;
  const concurrency = opts.concurrency ?? 3;
  const maxBatchChars = opts.maxBatchChars ?? 1500;

  const batches = groupIntoBatches(items, maxBatchChars);
  const total = items.length;
  const controller = new AbortController();
  let done = 0;
  let cursor = 0;
  let paused = false;
  let onResume: (() => void) | null = null;

  function advance(count: number) {
    done += count;
    onProgress(done, total);
  }

  async function waitWhilePaused() {
    while (paused && !controller.signal.aborted) {
      await new Promise<void>((resolve) => {
        onResume = resolve;
      });
    }
  }

  async function runBatch(batch: BatchItem[]) {
    const payload = encodeBatch(batch);
    let raw: string | null = null;
    try {
      raw = await translate(payload, controller.signal);
    } catch {
      if (controller.signal.aborted) return;
      try {
        raw = await translate(payload, controller.signal);
      } catch (retryError) {
        if (!controller.signal.aborted) onError(retryError);
        advance(batch.length);
        return;
      }
    }
    if (controller.signal.aborted || raw === null) return;

    const translations = decodeBatch(raw);
    for (const item of batch) {
      const translated = translations.get(item.id);
      if (translated) onResult(item.id, translated);
    }
    advance(batch.length);
  }

  async function worker() {
    while (!controller.signal.aborted) {
      await waitWhilePaused();
      if (controller.signal.aborted) break;
      const index = cursor;
      cursor += 1;
      const batch = batches[index];
      if (!batch) break;
      await runBatch(batch);
    }
  }

  const workerCount = Math.min(concurrency, batches.length);
  void Promise.all(Array.from({ length: workerCount }, () => worker())).catch(() => {});

  return {
    cancel() {
      controller.abort();
      onResume?.();
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      onResume?.();
      onResume = null;
    },
  };
}
