import { defineConfig } from 'wxt';
import { BRAND } from './src/brand';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  hooks: {
    // WXT derives action.default_title (the toolbar tooltip) from the popup's
    // <title>. Force it back to the brand so naming stays single-sourced in BRAND.
    'build:manifestGenerated': (_wxt, manifest) => {
      manifest.action ??= {};
      manifest.action.default_title = BRAND.name;
      // Toolbar action icon. WXT auto-detects `public/icon/*.png` into
      // manifest.icons; mirror them onto the action so the toolbar button
      // renders the brand mark at small densities.
      manifest.action.default_icon = {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
      };
      // Open the settings page as a full tab (WXT defaults options_ui to embedded).
      if (manifest.options_ui) manifest.options_ui.open_in_tab = true;
    },
  },
  manifest: ({ browser }) => ({
    name: BRAND.name,
    description:
      'Selection, full-page & screenshot translation powered by your own OpenAI-compatible or Anthropic-compatible LLM API.',
    // Minimal permission set — justifications live in docs/adr/0001 and store-assets (T5.4).
    // storage:      local persistence of settings & translation cache (ADR-0002)
    // contextMenus: right-click "Translate page / selection / Screenshot Translation" (T3.10, ADR-0006)
    // activeTab:    captureVisibleTab for Screenshot Translation keeps working on Firefox
    //               after optional host access is revoked (ADR-0006)
    permissions: ['storage', 'contextMenus', 'activeTab'],
    // The content script runs on every page (selection + full-page DOM), and the
    // background must reach any user-configured LLM Base URL. See ADR-0001.
    host_permissions: ['<all_urls>'],
    // Handlers registered in background (T2.6 / T3.10). suggested_key is a hint;
    // Chrome silently drops it on conflict and the user can rebind at
    // chrome://extensions/shortcuts.
    commands: {
      'translate-selection': {
        suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' },
        description: 'Translate the current selection',
      },
      'translate-page': {
        suggested_key: { default: 'Ctrl+Shift+P', mac: 'Command+Shift+P' },
        description: 'Translate the whole page',
      },
    },
    // AMO identity — immutable once listed (ADR-0005). Chrome/Edge ignore the key,
    // so only emit it for Firefox to keep their store validators quiet.
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'llm-translate@junrin-lee.github.io', strict_min_version: '128.0' },
          },
        }
      : {}),
  }),
});
