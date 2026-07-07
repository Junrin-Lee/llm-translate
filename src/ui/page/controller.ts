import type { ContentMessage, PageStatusReply } from '@/messaging/protocol';
import { getState, toggle } from './store';

/** Register the content-side handler for page-translation commands. */
export function setupPageTranslation(): void {
  browser.runtime.onMessage.addListener((message: ContentMessage) => {
    if (message?.type === 'translate-page') {
      toggle();
      return;
    }
    if (message?.type === 'get-page-status') {
      // Returning a value answers the popup's sendMessage query.
      return Promise.resolve<PageStatusReply>(getState().status);
    }
  });
}
