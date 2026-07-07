# LLM Translate

**English** · [简体中文](./README.zh-CN.md)

> Selection & full-page translation for the browser, powered entirely by **your own**
> OpenAI-compatible or Anthropic-compatible API key (BYOK). No account, no backend, no
> telemetry — all settings stay on your machine.

**Status:** Selection and full-page translation are fully working. It currently runs by
loading the unpacked build in the browser's developer mode; it is not published to the
stores yet (end-to-end tests, icon assets, privacy policy, and store submission are the
remaining release chores — see the
[roadmap](docs/superpowers/plans/2026-07-06-llm-translate-roadmap.md)).

## ✨ Features

- **Selection translation** — translate selected text in place via a streaming popup:
  - single words / short phrases → a **dictionary card** (phonetics, part of speech, senses, examples)
  - sentences / paragraphs → a **translation card**
  - copy, retry, switch target language on the fly; toggle between dictionary and translation views
- **Full-page translation** — translate the readable body, two display modes:
  - **Bilingual** (default): translations inserted under each original block, original kept
  - **Translation-only**: replaces the original in place, restorable in one click
  - viewport-first lazy loading, follows SPA route changes and dynamic content, in-page toolbar (progress / cancel / restore / mode toggle)
- **Multiple providers + routing** — save several provider profiles (protocol / Base URL / key / model / optional params), set a global default, and optionally override the provider per feature (selection, page)
- **Dual protocol** — OpenAI-compatible (`/chat/completions`) and Anthropic-compatible (`/v1/messages`), hand-rolled lightweight client, no vendor SDK
- **Flexible triggers** — selection icon / instant / shortcut-only; page translation via the popup, keyboard shortcut, right-click menu, or an auto-translate site list
- **Customizable** — override the three prompt templates and reset to default; UI language (Automatic / English / 中文); per-site disable list; JSON settings import/export (keys stripped by default)
- **Local cache** — content-keyed, LRU-evicted; re-translating a page after refresh is instant. View usage and clear it from settings.

## 🚀 Quick start

### 1. Get the extension

Before publication, build from source and load it in developer mode:

```sh
pnpm install
pnpm build          # outputs to .output/chrome-mv3/
```

1. Open `chrome://extensions` (or `edge://extensions`)
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked** and select the **`.output/chrome-mv3/`** folder (the folder itself, not a zip)

> For development, prefer `pnpm dev` — WXT launches a browser with the extension loaded and hot-reloads on save (see [Development](#-development)).

### 2. Configure a provider

1. Click the extension icon → **Open settings**, go to **Providers**
2. **Add provider** and fill in:
   - **Protocol**: OpenAI-compatible or Anthropic-compatible
   - **Base URL**: e.g. `https://api.openai.com/v1`, `https://api.anthropic.com`, or your compatible gateway
   - **API key**: your own key (stored only on this device)
   - **Model**: type it, or click "Fetch models" to pick from the list
3. Click **Test connection** to verify
4. The first provider becomes the global default; with several, assign per-feature providers under **Routing**

### 3. Translate

- **Selection**: select text on any page → click the icon (or press `Ctrl/⌘ + Shift + S`)
- **Page**: click the extension icon → "Translate this page", or press `Ctrl/⌘ + Shift + P`, or use the right-click menu
- Shortcuts can be rebound at `chrome://extensions/shortcuts`

## ⚙️ Settings

The settings page uses a sidebar: **Providers**, **Routing**, **Translation**, **Prompts**,
**Backup**, **Cache**. The Translation section covers target language, interface language,
selection trigger, and the per-site disable list.

## 🔒 Privacy & security

- All configuration and API keys live in `storage.local` and are **never synced or uploaded** — the only network request goes to the API endpoint **you** configure, carrying the text to translate. See [ADR-0002](docs/adr/0002-local-only-storage.md).
- All LLM network requests are made only from the background service worker; the content script and page context never touch your key.
- Page translations are written to the DOM with `textContent` only (LLM output is treated as untrusted input — XSS-safe); there is no `innerHTML` / `eval` anywhere in the codebase.
- Settings export **strips** API keys by default; keys are included only if you explicitly opt in (with a plain-text warning).

## 🛠️ Development

### Requirements

- Node.js 20 (v20.19+)
- pnpm 9.x — pinned via `packageManager`. If `pnpm` is missing:
  ```sh
  corepack prepare pnpm@9.15.9 --activate
  ```
  (pnpm 10/11 require Node 22+, so stay on pnpm 9 with Node 20.)

### Commands

```sh
pnpm dev          # Chrome: launches a browser with the extension, hot-reloads
pnpm dev:edge     # Edge

pnpm build        # production build → .output/chrome-mv3/
pnpm build:edge   # → .output/edge-mv3/

pnpm zip          # store upload package → .output/llm-translate-<version>-chrome.zip
pnpm zip:edge     # → .output/llm-translate-<version>-edge.zip

pnpm test         # vitest unit suite
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome (lint + format check)
pnpm format       # biome autofix
```

> The `.zip` is only for uploading to the store dashboards — you don't drag it into the
> browser. For local install use "Load unpacked" above. Chromium browsers (Edge/Brave/Arc)
> can also install the published Chrome Web Store listing directly.

## 📁 Project layout

```
src/
  brand.ts            product naming (single source of truth — import BRAND, never hardcode)
  languages.ts        target-language list
  i18n/               in-app en/zh catalogs + t() / useT() (not browser.i18n)
  llm/                dual-protocol client: types, sse, base-url, openai, anthropic, http, client
  storage/            local-only settings, resolve/fallback, import/export: schema, index, import-export
  prompts/            three default templates + interpolation: templates, index
  segmenter/          full-page DOM segmenter (block-level units)
  selection/          selection classification + dictionary parsing: classify, dict-result
  translator/         orchestrate / batch / cache / DOM inject: orchestrator, batch, cache, inject
  messaging/          background message protocol + request handler + port client: protocol, handler, port-client
  ui/
    selection/        selection icon, popup (dictionary / translation cards)
    page/             in-page toolbar, page-translation store / controller
  entrypoints/        background, content, popup/, options/ (WXT entrypoints)
tests/                vitest suites mirroring src/
docs/                 CONTEXT glossary, ADRs, and the dev roadmap
```

## 🗺️ Roadmap

| Milestone | Scope | Status |
|---|---|---|
| M0 | Scaffold (WXT + React + TS, Biome, CI, four entrypoints) | ✅ |
| M1 | Dual-protocol client + provider management UI | ✅ |
| M2 | Selection translation (icon / popup / dictionary + translation cards / shortcut) | ✅ |
| M3 | Full-page translation (segment / batch / lazy / bilingual & replace / SPA / cache) | ✅ |
| M4 | Settings polish (prompt editor, import/export, cache clearing, in-app i18n) | ✅ |
| M5 | Release (E2E, icon assets, privacy policy, brand finalization, store submission) | ⬜ |

Full task breakdown in the [roadmap](docs/superpowers/plans/2026-07-06-llm-translate-roadmap.md).
Architectural decisions in [docs/adr/](docs/adr/); glossary in [CONTEXT.md](CONTEXT.md).
