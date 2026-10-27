import './selection.css';
import '@/ui/image/image.css';
import ReactDOM from 'react-dom/client';
import { ImageCaptureApp } from '@/ui/image/ImageCaptureApp';
import { setupPageTranslation } from '@/ui/page/controller';
import { PageToolbar } from '@/ui/page/PageToolbar';
import { maybeAutoTranslate } from '@/ui/page/store';
import { SelectionApp } from '@/ui/selection/SelectionApp';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',
  async main(ctx) {
    // Full-page translation runs against the light DOM, separate from the
    // Shadow-DOM selection UI below.
    setupPageTranslation();
    void maybeAutoTranslate();

    const ui = await createShadowRootUi(ctx, {
      name: 'llm-translate-ui',
      // Closed, so page scripts can't read the panel or the screenshot it shows
      // through element.shadowRoot (docs/issues/0006). Test builds (--mode e2e)
      // stay open because Playwright and Selenium can only reach open roots.
      mode: import.meta.env.MODE === 'e2e' ? 'open' : 'closed',
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        const root = ReactDOM.createRoot(container);
        root.render(
          <>
            <SelectionApp />
            <PageToolbar />
            <ImageCaptureApp />
          </>,
        );
        return root;
      },
      onRemove: (root) => root?.unmount(),
    });
    ui.mount();
  },
});
