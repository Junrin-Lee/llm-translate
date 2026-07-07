import { runRpc } from '@/messaging/port-client';
import { collectSegments } from '@/segmenter';
import { getSettings } from '@/storage';
import {
  finalizeErrors,
  injectPlaceholder,
  injectTranslation,
  isPageTranslated,
  restorePage,
} from '@/translator/inject';
import { type PageTranslateController, translateSegments } from '@/translator/orchestrator';

export type PageStatus = 'idle' | 'translating' | 'done';

export interface PageState {
  status: PageStatus;
  done: number;
  total: number;
}

let state: PageState = { status: 'idle', done: 0, total: 0 };
let controller: PageTranslateController | null = null;
const listeners = new Set<() => void>();

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

async function translate(): Promise<void> {
  if (state.status === 'translating' || isPageTranslated(document.body)) return;

  const { general } = await getSettings();
  const targetLang = general.targetLang;
  const segments = collectSegments(document.body);
  console.info(`[llm-translate] page translation: ${segments.length} segments → ${targetLang}`);
  if (segments.length === 0) {
    console.warn('[llm-translate] no translatable segments found on this page');
    return;
  }

  const elementById = new Map(segments.map((s) => [s.id, s.element]));
  for (const s of segments) injectPlaceholder(s.element);
  setState({ status: 'translating', done: 0, total: segments.length });

  controller = translateSegments(
    segments.map((s) => ({ id: s.id, text: s.text })),
    {
      translate: async (payload, signal) => {
        const event = await runRpc(
          { kind: 'translate-batch', feature: 'page', payload, vars: { targetLang } },
          65_000,
          signal,
        );
        if (event.type === 'batch-result') return event.text;
        if (event.type === 'error') throw new Error(event.message);
        throw new Error('Unexpected background response');
      },
      onResult: (id, text) => {
        const element = elementById.get(id);
        if (element) injectTranslation(element, text);
      },
      onProgress: (done, total) => {
        setState({ done, total });
        if (done >= total) {
          finalizeErrors(document.body);
          setState({ status: 'done' });
        }
      },
      onError: (error) => console.warn('[llm-translate] page batch failed', error),
    },
  );
}

export function cancel(): void {
  controller?.cancel();
  controller = null;
  finalizeErrors(document.body); // freeze any pending placeholders instead of endless shimmer
  setState({ status: isPageTranslated(document.body) ? 'done' : 'idle' });
}

export function restore(): void {
  controller?.cancel();
  controller = null;
  restorePage(document.body);
  setState({ status: 'idle', done: 0, total: 0 });
}

/** Toggle used by the popup button and keyboard shortcut. */
export function toggle(): void {
  if (state.status === 'idle' && !isPageTranslated(document.body)) void translate();
  else restore();
}
