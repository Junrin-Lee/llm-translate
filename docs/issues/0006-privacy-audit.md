# 0006 — Privacy audit: page scripts can read the extension UI and the screenshot, and the privacy policy lags behind the features

**English** · [简体中文](./0006-privacy-audit.zh-CN.md)

- **Reported:** 2026-10-27, from a repository-wide privacy audit after the v0.6.0 release
- **Status:** Fixed (full iframe isolation for item 1 left for later)
- **Verified by:** reading the source, and a Playwright script in the page's main world that reached the extension's shadow root before the fix and could not after

## Symptom

The audit found five problems, most severe first:

| # | Level | Problem |
|---|-------|---------|
| 1 | Medium | During Screenshot Translation the whole-tab capture is placed in the host page's DOM as a data URL. Page scripts can read it, including what cross-origin iframes showed |
| 2 | Medium | The privacy policy (last updated 2026-07-14) does not cover Text translation or Selection Search, and "only carry the text you chose to translate" is no longer accurate |
| 3 | Low | Every in-page UI (selection panel, search answers, page toolbar) lives in an open shadow root that page scripts and session-replay SDKs can read |
| 4 | Low | A non-local `http://` Base URL is accepted with no warning, so the API key and text travel in cleartext |
| 5 | Low | The page translation cache lives in `storage.local` with no expiry, so translations of private pages stay on disk until they fall out of the 1,000-entry LRU or the user clears the cache |

## Root cause

**1 and 3 share a root cause.** `src/entrypoints/content.tsx:20` calls `createShadowRootUi` without a `mode`, and WXT defaults to `"open"` (`node_modules/wxt/dist/utils/content-script-ui/shadow-root.mjs:29`). The page's main world can reach an open shadow root through `element.shadowRoot`.

The capture path: `src/capture/launch.ts:12` captures the visible tab with `tabs.captureVisibleTab` and messages the data URL to that page's content script (`src/ui/image/ImageCaptureApp.tsx:25`), and `src/ui/image/CropOverlay.tsx:64` renders it as `<img src={dataUrl}>`. `captureVisibleTab` returns composited pixels, so cross-origin iframes (payment forms, third-party sign-in frames, embeds of other sites) are in the image. The same-origin policy keeps those frames away from the host page; once the image sits in an open shadow root, it no longer does.

**2** is documentation drift: v0.5.0 added Text translation and v0.6.0 added Selection Search, and the policy changed with neither.

**4**: neither `normalizeBaseUrl` (`src/llm/base-url.ts`) nor `ProviderCard` looks at the scheme.

**5** is deliberate (`src/entrypoints/background.ts:22-31`), but it has no expiry.

## Evidence

1. In Playwright, `!!document.querySelector('llm-translate-ui')?.shadowRoot` evaluated in the page's main world returns `true`. Any site script can do the same.
2. While the crop overlay is up, a site can put a `MutationObserver` on that shadow root and read `img.src`, which is the full capture. A data URL does not taint a canvas, so the site can draw it and upload it.
3. The policy says "The only outbound network requests ... only carry the text you chose to translate". These cases don't fit that sentence:
   - Auto-translate sites send the whole page without a per-page action, and keep translating after SPA navigation.
   - Text translation sends on paste right away, and 2 seconds after the last keystroke.
   - Selection Search's built-in prompt tells the model to "Search the web", so a web-enabled provider forwards the selection to its own search backend, which is a third party.
   - Links in search answers lead to third-party sites when clicked.
4. The selection panel, search answers and error messages render into the same open shadow root, so point 1 applies to them too.

## Fix plan

| # | Plan | Cost |
|---|------|------|
| 1 | Preferred: move region selection and cropping into an extension-origin iframe (a web_accessible page) so the data URL never enters the host page's DOM. Fallback: only switch the shadow root to `closed` | The iframe needs a rework of the crop overlay. `closed` is one line and stops reads through `shadowRoot`, but the capture is still a node in the host page's DOM, which isolates it less than an iframe does |
| 2 | Update both language versions of the privacy policy: Text translation, Selection Search (the provider may search the web), when auto-translate sites send, and how long the page cache keeps entries. Also review the store privacy disclosures under `store-assets/` | Docs only |
| 3 | Pass `mode: 'closed'` to `createShadowRootUi` | Playwright locators cannot pierce a closed shadow root, so existing e2e tests must assert another way (a test-only switch, or an extension page) |
| 4 | Warn on ProviderCard when the Base URL is `http://` and not local. Don't block it: local gateways need http | One message and one check |
| 5 | Give the page cache a TTL (for example 7 days), or a setting to keep it only until the browser closes | One time check per entry; entries already store `t` |

## Fix

| # | Change |
|---|--------|
| 1, 3 | `src/entrypoints/content.tsx`: pass `mode: 'closed'` to `createShadowRootUi`. Test builds (`--mode e2e`) stay `open`, since Playwright and Selenium can only enter open roots. The `e2e`, `e2e:ui`, `e2e:firefox` and `screenshots` scripts build with `--mode e2e` into `.output/chrome-mv3-e2e`, so they no longer overwrite the `.output/chrome-mv3` you load day to day |
| 1, 3 | `src/ui/selection/TranslatePanel.tsx`: the click-outside check now hit-tests by position. With a closed root, `composedPath()` seen from a `document` listener stops at the host, so the old check would have closed the panel on every click inside it |
| 2 | Both language versions of the privacy policy gain "When text is sent" and "Extension UI on web pages", covering Text translation, Selection Search, when auto-translate sites send, the 7-day cache and the plain-http warning. `store-assets/justifications.md` now mentions Selection Search in the single purpose and data disclosures |
| 4 | `src/llm/base-url.ts` adds `isCleartextRemote()`, and `ProviderCard` shows a warning under the Base URL. Loopback (localhost, `*.localhost`, 127.x, `[::1]`) is not flagged |
| 5 | `src/translator/cache.ts` adds `ttlMs`: expired entries stop serving and are deleted on the next write. The page cache uses 7 days |

## Verification

- 7 new unit tests (3 for the cache TTL, 4 for the cleartext check), red before and green after; the full suite of 286 passes.
- All 15 e2e tests pass on the `--mode e2e` build; typecheck and `verify:firefox` pass.
- On the production build: `document.querySelector('llm-translate-ui').shadowRoot` is `null` from the page's main world; with the search panel open, clicking the Translation tab keeps the panel open and switches tabs; clicking outside closes it.

## Checked and fine

- No telemetry, and no outbound requests except to the configured endpoint (no other `fetch`, `sendBeacon` or WebSocket in the repo).
- Settings export drops API keys by default. Keys never appear in logs or error messages, and error details are capped at the first 300 characters of the provider's reply.
- Selection ignores input, textarea and contenteditable. Page translation skips textarea, contenteditable, code, pre and hidden elements.
- Search-answer links allow only http/https and carry `rel="noopener noreferrer"`, so they don't leak the referring page.
- There is no `externally_connectable`, so web pages cannot message the background.
- No secrets are committed. The Firefox signing script passes AMO credentials through the environment, not command-line arguments, and never prints them.

## Left open on purpose

- The full fix for item 1 (crop inside an extension-origin iframe) is not done. The closed root already blocks reads through `shadowRoot`; the iframe can come later.
- No automated test covers closed mode in the production build, because e2e can only drive the open build. A manual probe verified it this time.

- Page translation writes translations into the page's own DOM, which the feature requires. Page scripts and session-replay SDKs can see them. The source text is already on the page, so the extra leak is only that the user translated it, and into which language.
- Text translation sends on paste because the user asked for that interaction, so an accidentally pasted password goes out immediately. The policy will say so; the behavior stays.
