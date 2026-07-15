# Store listing — English

**Name:** LLM Translate

**Category:** Productivity

**Summary** (≤132 chars):

> Selection, full-page & screenshot translation with your own OpenAI/Anthropic-compatible key. No account, no backend, no telemetry.

## Detailed description

LLM Translate brings large-language-model translation to any web page — using
**your own** API key. Bring an OpenAI-compatible or Anthropic-compatible endpoint
(official APIs, a gateway, or your own proxy), and translate right where you read.

**Selection translation**
Select any text to get an instant, streaming translation in place. Short words and
phrases show a dictionary card (phonetics, part of speech, senses, examples);
sentences show a clean translation. Copy, retry, or switch the target language on
the fly.

**Full-page translation**
Translate the whole page in bilingual mode (translation under each paragraph, with
the original kept) or translation-only mode (restorable in one click). It loads
lazily as you scroll, follows single-page-app navigation, and shows an in-page
toolbar for progress, cancel, and restore.

**Screenshot translation**
Drag-select a region over a frozen capture of the page to translate the text
inside it — the result streams in a card you can drag aside. On restricted pages
(the built-in PDF viewer, browser-internal pages) it falls back to an extension
page that also accepts pasted, dropped, or chosen images. Requires a routed model
that accepts image input.

**Your keys, your endpoint, your privacy**
- Bring your own OpenAI-compatible or Anthropic-compatible API key.
- Everything is stored locally on your device — no account, no sign-in.
- The only network request goes to the endpoint you configure; the developer runs
  no server and collects no data. No telemetry.

**Made to fit your workflow**
- Multiple provider profiles with a global default and per-feature overrides.
- Trigger by floating icon, instantly on selection, or by keyboard shortcut.
- Right-click menu and an auto-translate list for sites you always want translated.
- Customizable prompt templates, per-site disable list, and JSON import/export
  (API keys stripped by default).
- Interface in English or Chinese.

## Screenshot captions

1. Selection translation popup on an article.
2. Full-page bilingual translation with the in-page toolbar.
3. Screenshot translation: drag-select a region over a frozen page capture; the translation streams in a card.
4. Settings — providers, with connection test.
5. Settings — routing, prompts, and cache.

## AMO (Firefox Add-ons)

> Selection, full-page & screenshot translation with your own OpenAI/Anthropic-compatible key. No account, no backend, no telemetry.

The same extension, now on Firefox (Manifest V3, Firefox 128+).

**Keep "site access" on**
During install, Firefox asks you to confirm site access for LLM Translate —
please leave it checked so selection and page translation work on every site.
If you skip it, or turn it off later from Firefox's extension permissions
panel, the extension opens a short onboarding page the next time it starts,
with a single **Grant site access** button to turn it back on; nothing breaks
silently.
