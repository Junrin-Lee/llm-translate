import { runRpc } from '@/messaging/port-client';
import type { ContentMessage } from '@/messaging/protocol';
import { collectSegments } from '@/segmenter';
import { getSettings } from '@/storage';
import { injectTranslation, isPageTranslated, restorePage } from '@/translator/inject';
import { type PageTranslateController, translateSegments } from '@/translator/orchestrator';

let active: PageTranslateController | null = null;

async function translatePage(): Promise<void> {
  if (isPageTranslated(document.body)) return;

  const { general } = await getSettings();
  const targetLang = general.targetLang;
  const segments = collectSegments(document.body);
  if (segments.length === 0) return;

  const elementById = new Map(segments.map((s) => [s.id, s.element]));

  active?.cancel();
  active = translateSegments(
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
      onProgress: () => {},
      onError: (error) => console.warn('[llm-translate] page batch failed', error),
    },
  );
}

function restore(): void {
  active?.cancel();
  active = null;
  restorePage(document.body);
}

/** Register the content-side handler for page-translation commands. */
export function setupPageTranslation(): void {
  browser.runtime.onMessage.addListener((message: ContentMessage) => {
    if (message?.type !== 'translate-page') return;
    // Toggle: translate a fresh page, restore an already-translated one.
    if (isPageTranslated(document.body)) restore();
    else void translatePage();
  });
}
