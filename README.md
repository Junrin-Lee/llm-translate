# LLM Translate

**English** · [简体中文](./README.zh-CN.md)

> Selection & full-page translation for the browser, powered entirely by **your own**
> OpenAI-compatible or Anthropic-compatible API key (BYOK). No account, no backend, no
> telemetry — all settings stay on your machine.

**Status:** Selection and full-page translation are fully working, with E2E tests, icon
assets, and the privacy policy all in place. It currently runs by loading the unpacked
build in the browser's developer mode; the only remaining release chore is the first
manual submission to the Chrome Web Store / Edge Add-ons / Firefox Add-ons (AMO) — see the
[roadmap](docs/superpowers/plans/2026-07-06-llm-translate-roadmap.md).

## ✨ Features

- **Selection translation** — translate selected text in place via a streaming popup:
  - single words / short phrases → a **dictionary card** (phonetics, part of speech, senses, examples)
  - sentences / paragraphs → a **translation card**
  - copy, retry, switch target language (updates your default target language), drag the popup aside; toggle between dictionary and translation views
- **Full-page translation** — translate the readable body, two display modes:
  - **Bilingual** (default): translations inserted under each original block, original kept
  - **Translation-only**: replaces the original in place, restorable in one click
  - viewport-first lazy loading, follows SPA route changes and dynamic content, retry failed blocks (per-block or all at once), draggable in-page toolbar (progress / cancel / restore / mode toggle)

<details>
<summary><b>More, for power users</b> — providers, routing, dual protocol, triggers, customization, cache (click to expand)</summary>

- **Multiple providers + routing** — save several provider profiles (protocol / Base URL / key / model / optional params), set a global default, and optionally override the provider per feature (selection, page)
- **Dual protocol** — OpenAI-compatible (`/chat/completions`) and Anthropic-compatible (`/v1/messages`), hand-rolled lightweight client, no vendor SDK
- **Flexible triggers** — selection icon / instant / shortcut-only; page translation via the popup, keyboard shortcut, right-click menu, or an auto-translate site list
- **Customizable** — override the three prompt templates and reset to default; UI language (Automatic / English / 中文); per-site disable list; JSON settings import/export (keys stripped by default)
- **Local cache** — content-keyed, LRU-evicted; re-translating a page after refresh is instant. View usage and clear it from settings.

</details>

## 🚀 Quick start

### 1. Install the extension

- **Chrome / Edge** (and Chromium browsers like Brave, Arc) — grab the latest `…-chrome.zip` or `…-edge.zip` from [Releases](https://github.com/Junrin-Lee/llm-translate/releases), unzip it into a folder you'll keep, then open `chrome://extensions`, turn on **Developer mode**, and click **Load unpacked** to select that folder.
- **Firefox** — coming to Firefox Add-ons (AMO) soon for one-click install; to try it now, load it temporarily per [Install on Firefox](docs/INSTALL.md#install-on-firefox).

For screenshots, updating, and troubleshooting (e.g. "loaded it but there's no toolbar icon"), see the full [install guide](docs/INSTALL.md).

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
- **Auto-translate a site**: open the popup and tick **Always translate** for the current site — its pages then translate automatically on load
- Shortcuts can be rebound at `chrome://extensions/shortcuts`

| ![Selection translation: streaming popup with a dictionary / translation card](store-assets/screenshots/01-selection.png) | ![Full-page translation: bilingual mode inserts the translation under each original block](store-assets/screenshots/02-page-bilingual.png) |
| :--: | :--: |

## ⚙️ Settings

The settings page uses a sidebar: **Providers**, **Routing**, **Translation**, **Prompts**,
**Backup**, **Cache**. The Translation section covers target language, interface language,
selection trigger, and the per-site disable list.

| ![Providers settings: protocol / Base URL / key / model](store-assets/screenshots/03-providers.png) | ![Routing: assign a provider per feature (selection, page)](store-assets/screenshots/04-routing.png) |
| :--: | :--: |
| ![Translation: target language, interface language, selection trigger, per-site disable list](store-assets/screenshots/05-translation.png) | ![Prompts: override the dictionary / selection / full-page templates, reset to default](store-assets/screenshots/06-prompts.png) |
| ![Backup: export settings as JSON (keys stripped by default) and import](store-assets/screenshots/07-backup.png) | ![Cache: view selection / page entry counts and clear](store-assets/screenshots/08-cache.png) |

## 🔒 Privacy & security

- All configuration and API keys live in `storage.local` and are **never synced or uploaded** — the only network request goes to the API endpoint **you** configure, carrying the text to translate. See [ADR-0002](docs/adr/0002-local-only-storage.md).
- All LLM network requests are made only from the background service worker; the content script and page context never touch your key.
- Page translations are written to the DOM with `textContent` only (LLM output is treated as untrusted input — XSS-safe); there is no `innerHTML` / `eval` anywhere in the codebase.
- Settings export **strips** API keys by default; keys are included only if you explicitly opt in (with a plain-text warning).

Full policy: [docs/privacy-policy.md](docs/privacy-policy.md).

## 🛠️ Development

> This section is for contributors and anyone building from source. If you just want to use the extension, the [Quick start](#-quick-start) above is all you need.

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
pnpm dev:firefox  # Firefox

pnpm build        # production build → .output/chrome-mv3/
pnpm build:edge   # → .output/edge-mv3/

pnpm zip          # store upload package → .output/llm-translate-<version>-chrome.zip
pnpm zip:edge     # → .output/llm-translate-<version>-edge.zip
pnpm zip:firefox  # → .output/llm-translate-<version>-firefox.zip

pnpm test         # vitest unit suite
pnpm e2e          # Playwright end-to-end (loads the built extension)
pnpm e2e:firefox  # Selenium smoke suite against a real Firefox
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome (lint + format check)
pnpm format       # biome autofix

pnpm screenshots  # regenerate the store screenshots in store-assets/
```

> The `.zip` is only for uploading to the store dashboards — you don't drag it into the
> browser. For local install use "Load unpacked" above. Chromium browsers (Edge/Brave/Arc)
> can also install the published Chrome Web Store listing directly.

> Firefox commands require Firefox ≥128 and build Manifest V3, same as Chrome/Edge — see
> [ADR-0005](docs/adr/0005-firefox-mv3-with-permission-onboarding.md). `pnpm e2e:firefox`
> downloads a matching Firefox + geckodriver on first run via Selenium Manager (needs network).

## 📁 Project layout

```
.
├── src/
│   ├── brand.ts              product naming (single source of truth — import BRAND, never hardcode)
│   ├── languages.ts          target-language list
│   ├── permissions.ts        <all_urls> host-access helpers behind Permission Onboarding (Firefox, ADR-0005)
│   ├── i18n/                 in-app en/zh catalogs + t() / useT() (not browser.i18n)
│   ├── llm/                  dual-protocol client: types, sse, base-url, openai, anthropic, http, client
│   ├── storage/              local-only settings, resolve/fallback, import/export: schema, index, import-export
│   ├── prompts/              three default templates + interpolation: templates, index
│   ├── segmenter/            full-page DOM segmenter (block-level units)
│   ├── selection/            selection classification + dictionary parsing: classify, dict-result
│   ├── translator/           orchestrate / batch / cache / DOM inject: orchestrator, batch, cache, inject
│   ├── messaging/            background message protocol + request handler + port client: protocol, handler, port-client
│   ├── ui/
│   │   ├── selection/        selection icon, popup (dictionary / translation cards)
│   │   ├── page/             in-page toolbar, page-translation store / controller
│   │   └── PermissionBanner  site-access warning banner (popup + settings) for Permission Onboarding
│   └── entrypoints/          background, content, popup/, options/, onboarding/ (WXT entrypoints)
├── tests/                    vitest suites mirroring src/
├── e2e/                      Playwright specs + mock LLM server + fixtures
├── e2e-firefox/              Selenium (vitest) smoke + permission-onboarding suite against a real Firefox
├── scripts/                  tooling: store screenshot capture, Firefox manifest verification
├── store-assets/             listing copy (Chrome + AMO), permission justifications, screenshots
└── docs/                     install guide, CONTEXT glossary, ADRs, privacy policy, roadmap
```

## 🗺️ Roadmap

| Milestone | Scope | Status |
|---|---|---|
| M0 | Scaffold (WXT + React + TS, Biome, CI, four entrypoints) | ✅ |
| M1 | Dual-protocol client + provider management UI | ✅ |
| M2 | Selection translation (icon / popup / dictionary + translation cards / shortcut) | ✅ |
| M3 | Full-page translation (segment / batch / lazy / bilingual & replace / SPA / cache) | ✅ |
| M4 | Settings polish (prompt editor, import/export, cache clearing, in-app i18n) | ✅ |
| M5 | Release (E2E, icons, privacy policy, brand finalized) | 🚧 only store submission left |
| M6 | Firefox / AMO support (MV3 + Permission Onboarding, Selenium smoke) | 🚧 built; AMO submission left |

Full task breakdown in the roadmap ([core](docs/superpowers/plans/2026-07-06-llm-translate-roadmap.md),
[Firefox](docs/superpowers/plans/2026-07-09-firefox-support.md)).
Architectural decisions in [docs/adr/](docs/adr/); glossary in [CONTEXT.md](CONTEXT.md).
