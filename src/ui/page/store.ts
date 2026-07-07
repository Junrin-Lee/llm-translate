import { runRpc } from '@/messaging/port-client';
import { collectSegments, type Segment } from '@/segmenter';
import { getSettings, updateSettings } from '@/storage';
import type { PageMode } from '@/storage/schema';
import {
  finalizeErrors,
  injectPlaceholder,
  injectTranslation,
  isPageTranslated,
  restorePage,
  setReplaceMode,
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
  mode: PageMode;
}

// Translate a bit beyond the viewport so content is ready before it scrolls in.
const ROOT_MARGIN = '600px 0px';
const FLUSH_DELAY_MS = 150;
const RESCAN_DELAY_MS = 300;
const LOCATION_EVENT = 'llmt:locationchange';

let state: PageState = { status: 'idle', done: 0, total: 0, mode: 'bilingual' };
const listeners = new Set<() => void>();

let observer: IntersectionObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let rescanTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
const controllers = new Set<PageTranslateController>();
let pending: Segment[] = [];
const queued = new Set<number>();
const elementById = new Map<number, Element>();
const segmentByElement = new Map<Element, Segment>();
const trackedElements = new Set<Element>();
let nextId = 0;
let targetLang = 'zh-CN';
let total = 0;
let globalDone = 0;
let lastHref = '';
let historyPatched = false;

function setState(patch: Partial<PageState>): void {
  const previousStatus = state.status;
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
  if (state.status !== previousStatus) {
    // Let the background update the context-menu label for this tab.
    browser.runtime
      .sendMessage({ type: 'page-status-changed', status: state.status })
      .catch(() => {});
  }
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

/** Register untracked segments with store-owned ids and start observing them. */
function trackNewSegments(segments: Segment[]): void {
  let added = 0;
  for (const segment of segments) {
    if (trackedElements.has(segment.element)) continue;
    trackedElements.add(segment.element);
    const id = nextId;
    nextId += 1;
    const tracked: Segment = { id, element: segment.element, text: segment.text };
    elementById.set(id, segment.element);
    segmentByElement.set(segment.element, tracked);
    observer?.observe(segment.element);
    added += 1;
  }
  if (added > 0) {
    total = nextId;
    setState({ total });
  }
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

function scheduleRescan(): void {
  if (rescanTimer !== null) return;
  rescanTimer = setTimeout(() => {
    rescanTimer = null;
    if (state.status !== 'idle') trackNewSegments(collectSegments(document.body));
  }, RESCAN_DELAY_MS);
}

function onMutation(mutations: MutationRecord[]): void {
  // Rescan only when foreign content is added — ignore our own injected nodes.
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && !(node as Element).hasAttribute('data-llmt')) {
        scheduleRescan();
        return;
      }
    }
  }
}

function installHistoryPatch(): void {
  if (historyPatched) return;
  historyPatched = true;
  const fire = () => window.dispatchEvent(new Event(LOCATION_EVENT));
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<History['pushState']>) => {
    const result = origPush(...args);
    fire();
    return result;
  };
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    const result = origReplace(...args);
    fire();
    return result;
  };
  window.addEventListener('popstate', fire);
}

function onLocationChange(): void {
  if (location.href !== lastHref && state.status !== 'idle') {
    // SPA navigated to a new page — drop stale translation state.
    restore();
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

  nextId = 0;
  globalDone = 0;
  total = 0;
  const mode = settings.general.pageMode;
  setReplaceMode(mode === 'replace');
  setState({ status: 'translating', done: 0, total: 0, mode });

  observer = new IntersectionObserver(onIntersect, { rootMargin: ROOT_MARGIN });
  trackNewSegments(segments);

  // Follow content added later (infinite scroll, SPA sections) and route changes.
  mutationObserver = new MutationObserver(onMutation);
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  installHistoryPatch();
  lastHref = location.href;
  window.addEventListener(LOCATION_EVENT, onLocationChange);
}

function teardown(): void {
  observer?.disconnect();
  observer = null;
  mutationObserver?.disconnect();
  mutationObserver = null;
  window.removeEventListener(LOCATION_EVENT, onLocationChange);
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (rescanTimer !== null) {
    clearTimeout(rescanTimer);
    rescanTimer = null;
  }
  for (const controller of controllers) controller.cancel();
  controllers.clear();
  pending = [];
  queued.clear();
  elementById.clear();
  segmentByElement.clear();
  trackedElements.clear();
  flushing = false;
  nextId = 0;
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

/** Switch between bilingual and translation-only display, persisting the choice. */
export async function setMode(mode: PageMode): Promise<void> {
  setReplaceMode(mode === 'replace');
  setState({ mode });
  const settings = await getSettings();
  await updateSettings({ general: { ...settings.general, pageMode: mode } });
}

/** On load, translate automatically if this host is on the auto-translate list. */
export async function maybeAutoTranslate(): Promise<void> {
  const { siteRules } = await getSettings();
  if (siteRules.autoTranslate.includes(location.hostname)) void translate();
}
