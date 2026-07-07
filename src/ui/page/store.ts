import { runRpc } from '@/messaging/port-client';
import { collectSegments, type Segment } from '@/segmenter';
import { getSettings } from '@/storage';
import {
  finalizeErrors,
  injectPlaceholder,
  injectTranslation,
  isPageTranslated,
  restorePage,
} from '@/translator/inject';
import {
  type PageTranslateController,
  type TranslateBatchFn,
  translateSegments,
} from '@/translator/orchestrator';

export type PageStatus = 'idle' | 'translating' | 'done';

export interface PageState {
  status: PageStatus;
  done: number;
  total: number;
}

// Translate a bit beyond the viewport so content is ready before it scrolls in.
const ROOT_MARGIN = '600px 0px';
const FLUSH_DELAY_MS = 150;

let state: PageState = { status: 'idle', done: 0, total: 0 };
const listeners = new Set<() => void>();

let observer: IntersectionObserver | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
const controllers = new Set<PageTranslateController>();
let pending: Segment[] = [];
const queued = new Set<number>();
const elementById = new Map<number, Element>();
const segmentByElement = new Map<Element, Segment>();
let targetLang = 'zh-CN';
let total = 0;
let globalDone = 0;

function setState(patch: Partial<PageState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getState(): PageState {
  return state;
}

function makeTranslate(): TranslateBatchFn {
  return async (payload, signal) => {
    const event = await runRpc(
      { kind: 'translate-batch', feature: 'page', payload, vars: { targetLang } },
      65_000,
      signal,
    );
    if (event.type === 'batch-result') return event.text;
    if (event.type === 'error') throw new Error(event.message);
    throw new Error('Unexpected background response');
  };
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

function flush(): void {
  if (flushing || pending.length === 0) return;
  flushing = true;
  const batch = pending;
  pending = [];

  const controller = translateSegments(
    batch.map((s) => ({ id: s.id, text: s.text })),
    {
      translate: makeTranslate(),
      onResult: (id, text) => {
        const element = elementById.get(id);
        if (element) injectTranslation(element, text);
      },
      onProgress: (done, batchTotal) => {
        setState({ done: globalDone + done, total });
        if (done >= batchTotal) {
          globalDone += batchTotal;
          controllers.delete(controller);
          flushing = false;
          if (pending.length > 0) scheduleFlush();
          else {
            finalizeErrors(document.body);
            setState({ status: 'done' });
          }
        }
      },
      onError: (error) => console.warn('[llm-translate] page batch failed', error),
    },
  );
  controllers.add(controller);
}

function onIntersect(entries: IntersectionObserverEntry[]): void {
  let queuedAny = false;
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const segment = segmentByElement.get(entry.target);
    if (!segment || queued.has(segment.id)) continue;
    queued.add(segment.id);
    injectPlaceholder(segment.element);
    pending.push(segment);
    observer?.unobserve(entry.target);
    queuedAny = true;
  }
  if (queuedAny) {
    if (state.status === 'done') setState({ status: 'translating' });
    scheduleFlush();
  }
}

async function translate(): Promise<void> {
  if (state.status === 'translating' || isPageTranslated(document.body)) return;

  const settings = await getSettings();
  targetLang = settings.general.targetLang;
  const segments = collectSegments(document.body);
  console.info(`[llm-translate] page translation: ${segments.length} segments → ${targetLang}`);
  if (segments.length === 0) {
    console.warn('[llm-translate] no translatable segments found on this page');
    return;
  }

  total = segments.length;
  globalDone = 0;
  for (const segment of segments) {
    elementById.set(segment.id, segment.element);
    segmentByElement.set(segment.element, segment);
  }
  setState({ status: 'translating', done: 0, total });

  observer = new IntersectionObserver(onIntersect, { rootMargin: ROOT_MARGIN });
  for (const segment of segments) observer.observe(segment.element);
}

function teardown(): void {
  observer?.disconnect();
  observer = null;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const controller of controllers) controller.cancel();
  controllers.clear();
  pending = [];
  queued.clear();
  elementById.clear();
  segmentByElement.clear();
  flushing = false;
  globalDone = 0;
  total = 0;
}

export function cancel(): void {
  teardown();
  finalizeErrors(document.body); // freeze any pending placeholders instead of endless shimmer
  setState({ status: isPageTranslated(document.body) ? 'done' : 'idle' });
}

export function restore(): void {
  teardown();
  restorePage(document.body);
  setState({ status: 'idle', done: 0, total: 0 });
}

/** Toggle used by the popup button and keyboard shortcut. */
export function toggle(): void {
  if (state.status === 'idle' && !isPageTranslated(document.body)) void translate();
  else restore();
}
