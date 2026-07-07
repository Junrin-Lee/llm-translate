import type { ContentMessage } from '@/messaging/protocol';
import { toggle } from './store';

/** Register the content-side handler for page-translation commands. */
export function setupPageTranslation(): void {
  browser.runtime.onMessage.addListener((message: ContentMessage) => {
    if (message?.type === 'translate-page') toggle();
  });
}
