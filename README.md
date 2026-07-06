# LLM Translate

Selection & full-page translation for the browser, powered entirely by **your own**
OpenAI-compatible or Anthropic-compatible API key (BYOK). No account, no backend, no
telemetry — all settings stay on your machine.

> **Status:** under active development. The full headless pipeline (protocol
> adapters, storage, prompts, background router) is built and unit-tested. The
> in-browser configuration UI (provider management) is the next milestone, so
> end-to-end translation is not clickable in the browser *yet* — see
> [the roadmap](docs/superpowers/plans/2026-07-06-llm-translate-roadmap.md).

## Requirements

- Node.js 20 (v20.19+)
- pnpm 9.x — this repo pins it via `packageManager`. If `pnpm` is missing:
  ```sh
  corepack prepare pnpm@9.15.9 --activate
  ```
  (Note: pnpm 10/11 require Node 22+, so stay on pnpm 9 with Node 20.)

## Install

```sh
pnpm install
```

## Run it in a browser (development)

The easiest path — WXT launches a browser with the extension loaded and
hot-reloads on save:

```sh
pnpm dev          # Chrome
pnpm dev:edge     # Edge
```

## Load a production build manually (unpacked)

Browser extensions are **not** installed from a `.zip` during development — you
point the browser at the *unpacked build folder*:

1. `pnpm build` → outputs to `.output/chrome-mv3/`
2. Open `chrome://extensions` (or `edge://extensions`)
3. Toggle **Developer mode** on (top-right)
4. Click **Load unpacked** and select the **`.output/chrome-mv3/`** folder
   (select the folder itself, not a zip)

To pick up code changes, rebuild and hit the **↻ reload** button on the
extension card.

## Packaging for the stores

The `.zip` is only for uploading to the store dashboards — you don't drag it
into the browser:

```sh
pnpm zip          # -> .output/llm-translate-<version>-chrome.zip
pnpm zip:edge     # -> .output/llm-translate-<version>-edge.zip
```

Upload the Chrome zip to the [Chrome Web Store Developer Dashboard] and the Edge
zip to [Partner Center]. (Chromium browsers like Edge/Brave/Arc can also install
the published Chrome Web Store listing directly.)

## Quality checks

```sh
pnpm test         # vitest unit suite
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome (lint + format check)
pnpm format       # biome autofix
```

## Project layout

```
src/
  brand.ts            product naming (single source of truth)
  llm/                dual-protocol clients: types, sse, base-url, openai,
                      anthropic, http, client (retry + dispatch)
  storage/            local-only settings, resolve, import/export
  prompts/            default templates + interpolation
  messaging/          background message protocol + request handler
  entrypoints/        background, content, popup, options (WXT entrypoints)
tests/                vitest suites mirroring src/
docs/                 CONTEXT.md glossary, ADRs, and the dev roadmap
```

## Privacy

All configuration and API keys are stored locally (`storage.local`) and never
synced or sent anywhere except the API endpoint **you** configure. See
[ADR-0002](docs/adr/0002-local-only-storage.md).

[Chrome Web Store Developer Dashboard]: https://chrome.google.com/webstore/devconsole
[Partner Center]: https://partner.microsoft.com/dashboard/microsoftedge
