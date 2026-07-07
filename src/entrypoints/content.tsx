import './selection.css';
import ReactDOM from 'react-dom/client';
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
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        const root = ReactDOM.createRoot(container);
        root.render(
          <>
            <SelectionApp />
            <PageToolbar />
          </>,
        );
        return root;
      },
      onRemove: (root) => root?.unmount(),
    });
    ui.mount();
  },
});
