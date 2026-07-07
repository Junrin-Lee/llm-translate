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
      // Open the settings page as a full tab (WXT defaults options_ui to embedded).
      if (manifest.options_ui) manifest.options_ui.open_in_tab = true;
    },
  },
  manifest: {
    name: BRAND.name,
    description:
      'Selection & full-page translation powered by your own OpenAI-compatible or Anthropic-compatible LLM API.',
    // Minimal permission set — justifications live in docs/adr/0001 and store-assets (T5.4).
    // storage:      local persistence of settings & translation cache (ADR-0002)
    // contextMenus: right-click "Translate page / Translate selection" (T3.10)
    permissions: ['storage', 'contextMenus'],
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
  },
});
