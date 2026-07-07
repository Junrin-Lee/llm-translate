import { describe, expect, it, vi } from 'vitest';
import { decodeBatch, encodeBatch } from '@/translator/batch';
import { translateSegments } from '@/translator/orchestrator';

function items(count: number, len = 5) {
  return Array.from({ length: count }, (_, i) => ({ id: i, text: 'x'.repeat(len) }));
}

/** A well-behaved model: echoes each segment prefixed with "T:". */
const goodTranslate = async (payload: string) => {
  const map = decodeBatch(payload);
  return encodeBatch([...map.entries()].map(([id, text]) => ({ id, text: `T:${text}` })));
};

function run(
  segs: Array<{ id: number; text: string }>,
  overrides: Partial<Parameters<typeof translateSegments>[1]> = {},
) {
  const results = new Map<number, string>();
  return new Promise<{ results: Map<number, string>; progress: number[][]; errors: unknown[] }>(
    (resolve) => {
      const progress: number[][] = [];
      const errors: unknown[] = [];
      translateSegments(segs, {
        translate: goodTranslate,
        onResult: (id, text) => results.set(id, text),
        onProgress: (done, total) => {
          progress.push([done, total]);
          if (done >= total) resolve({ results, progress, errors });
        },
        onError: (e) => errors.push(e),
        ...overrides,
      });
    },
  );
}

describe('translateSegments', () => {
  it('translates every segment and reports completion', async () => {
    const { results, progress } = await run(items(3));
    expect(results.get(0)).toBe('T:xxxxx');
    expect(results.size).toBe(3);
    expect(progress.at(-1)).toEqual([3, 3]);
  });

  it('groups segments into batches by character budget', async () => {
    const translate = vi.fn(goodTranslate);
    // 4 items × 5 chars, budget 10 → 2 items per batch → 2 calls.
    await run(items(4, 5), { translate, maxBatchChars: 10 });
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it('sends everything in one batch when the budget is large', async () => {
    const translate = vi.fn(goodTranslate);
    await run(items(4, 5), { translate, maxBatchChars: 10_000 });
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const translate = async (payload: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      await Promise.resolve();
      active -= 1;
      return goodTranslate(payload);
    };
    await run(items(6, 5), { translate, maxBatchChars: 5, concurrency: 2 });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('retries a failed batch once, then delivers results', async () => {
    let calls = 0;
    const translate = async (payload: string) => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return goodTranslate(payload);
    };
    const { results } = await run(items(2, 5), { translate, maxBatchChars: 10_000 });
    expect(calls).toBe(2);
    expect(results.size).toBe(2);
  });

  it('reports an error but still completes progress when a batch keeps failing', async () => {
    const translate = async () => {
      throw new Error('always');
    };
    const { results, errors, progress } = await run(items(2), { translate });
    expect(results.size).toBe(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('leaves a dropped id untranslated but still finishes', async () => {
    const translate = async (payload: string) => {
      const map = decodeBatch(payload);
      // Drop id 1 from the response.
      return encodeBatch(
        [...map.entries()]
          .filter(([id]) => id !== 1)
          .map(([id, text]) => ({ id, text: `T:${text}` })),
      );
    };
    const { results, progress } = await run(items(2, 5), { translate, maxBatchChars: 10_000 });
    expect(results.has(0)).toBe(true);
    expect(results.has(1)).toBe(false);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('stops delivering results after cancel', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const translate = async (payload: string) => {
      await gate;
      return goodTranslate(payload);
    };
    const results = new Map<number, string>();
    const controller = translateSegments(items(2, 5), {
      translate,
      maxBatchChars: 10_000,
      onResult: (id, text) => results.set(id, text),
      onProgress: () => {},
      onError: () => {},
    });
    controller.cancel();
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(results.size).toBe(0);
  });
});
