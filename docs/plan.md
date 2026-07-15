# Project Plan — LLM Translation Browser Extension

**English** · [简体中文](./plan.zh-CN.md)

> Status: aligned with the product owner (2026-07-06). For terminology see the root [CONTEXT.md](../CONTEXT.md); for key trade-offs see [docs/adr/](./adr/).

## 1. Product Definition

A streamlined take on Trancy: at alignment, two features — **Selection Translation** and **Page Translation** — with translation powered entirely by the user's own LLM API (BYOK; no self-hosted backend, no account system). **Screenshot Translation** shipped after this alignment; see §13.

**Explicitly out of scope**: account binding, video/subtitle translation, vocabulary lists, PDF translation, and AI actions beyond selection (polishing/summarizing, etc.).

## 2. Aligned Decisions

| # | Decision Point | Conclusion |
|---|---|---|
| 1 | Release target | Publish to Chrome Web Store + Edge Add-ons (shared MV3 build) + Firefox Add-ons/AMO (own MV3 build, ADR-0005) |
| 2 | Tech stack | WXT + React + TypeScript, pnpm |
| 3 | Provider model | Multiple Provider Profiles; a Global Default Provider plus a per-feature Feature Override for Selection / Page (later extended to Screenshot — §13) |
| 4 | Selection trigger | Default "show icon on selection, click to translate"; supports a hotkey for direct translation; settings can switch to translate-on-select / hotkey-only |
| 5 | Selection content | Word/phrase → Dictionary Card (phonetics/part of speech/multiple senses/example sentences); sentence/paragraph → Translation Card; both stream their output |
| 6 | Page mode | Bilingual Mode is the default, switchable to Translation-only Mode (one-click restore) |
| 7 | Page trigger | Extension icon + hotkey + context menu + Auto-translate Site list |
| 8 | Permission model | content script always present on `<all_urls>` (see ADR-0001) |
| 9 | Data storage | Everything in `storage.local` only; config supports JSON import/export (see ADR-0002) |
| 10 | Prompt | Four built-in default templates (selection dictionary / selection text / page batch / screenshot), overridable in the settings Prompts section (variable interpolation), one-click restore to defaults |
| 11 | Naming | Working name `llm-translate`; brand name centrally managed as a constant, finalized before release |
| 12 | Engineering practices | vitest unit tests for core logic + Playwright E2E smoke + Biome + GitHub Actions |

## 3. Architecture

### 3.1 Entry Topology (WXT entrypoints)

```
entrypoints/
├── background.ts          # Service worker: the only LLM egress; menu/shortcut registration; badge + onboarding sync
├── content.tsx            # persistent content script: selection listening + panel UI + page-translation DOM engine
├── popup/                 # extension-icon popup: translate/restore-page button, open-settings, auto-translate-site switch
├── options/               # settings page: Provider CRUD, trigger mode, Prompt templates, import/export
└── onboarding/            # post-install site-access grant page (Permission Onboarding, Firefox — ADR-0005)
```

### 3.2 Key Data Flows

```
Selection: selection → icon → content opens a port → background calls the LLM (SSE)
           → chunks streamed back over the port → panel renders incrementally
Page:      trigger → content scans & segments the DOM → batches sent to background over the port → concurrent LLM calls
           → each batch's result returned → content injects translation nodes (Bilingual / Translation-only)
```

- **All network requests are made only from the background service worker** (using `host_permissions` to bypass page CORS; the content script never connects to the API directly).
- Streaming and batch results all go through the **Port** channel of `chrome.runtime.connect` (which also keeps the SW alive; an MV3 SW sleeps after 30s idle, and active port messages plus in-flight fetches extend its lifetime).
- Minimal state: no global store; config reads/writes go through a unified storage module, and the content script uses local React state internally.

### 3.3 Module Breakdown (src/)

```
src/
├── llm/                   # ★ protocol layer (pure logic, heavily unit-tested)
│   ├── types.ts           # TranslationClient interface; request/response/error-normalization types
│   ├── openai.ts          # OpenAI-compatible adapter
│   ├── anthropic.ts       # Anthropic-compatible adapter
│   └── sse.ts             # generic SSE parser (fetch + ReadableStream)
├── translator/            # translation orchestration: prompt assembly, batching, concurrency, retry, cache
├── messaging/             # background message protocol + request handler + port client (content ⇄ background)
├── segmenter/             # ★ page DOM segmenter (pure logic, heavily unit-tested)
├── selection/             # selection classification: word/phrase vs sentence (pure logic, heavily unit-tested)
├── storage/               # storage.local schema, migration, import/export
├── prompts/               # four default templates (incl. screenshot) + variable interpolation
├── permissions.ts         # <all_urls> host-access helpers behind Permission Onboarding (Firefox — ADR-0005)
└── ui/                    # panel, toolbar, popup/options shared components + PermissionBanner
```

## 4. Provider Protocol Layer

Unified interface (implemented by each of the two adapters):

```ts
interface TranslationClient {
  stream(req: ChatRequest, onDelta: (text) => void, signal: AbortSignal): Promise<ChatResult>
  complete(req: ChatRequest, signal: AbortSignal): Promise<ChatResult>
  listModels(): Promise<string[]>        // failures don't block; the model name can be entered manually
  testConnection(): Promise<TestResult>  // the settings-page "Test" button
}
```

| | OpenAI-compatible | Anthropic-compatible |
|---|---|---|
| Endpoint | `{base}/chat/completions` | `{base}/v1/messages` |
| Auth | `Authorization: Bearer <key>` | `x-api-key: <key>` |
| Required headers | — | `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true` (required for direct browser-context calls to the official API; harmless for compatible gateways) |
| Required params | model, messages | model, messages, **max_tokens** |
| system | first `role:system` in messages | top-level `system` field |
| Streaming | SSE, `choices[0].delta.content`, ends with `[DONE]` | SSE, `text_delta` from `content_block_delta` events |
| Model list | `GET {base}/models` | `GET {base}/v1/models` |

- Error normalization: 401/403 (credentials), 404 (endpoint or model), 429 (rate limit; read `retry-after` and back off, retry ≤2 times), 5xx (retry), network errors, timeout (default 60s, configurable per profile via `params.timeoutMs` — no dedicated UI field yet). Error messages are user-readable (Chinese and English).
- **No official SDK**; a hand-rolled lightweight client: symmetric across both protocols, small bundle size, zero adaptation for the MV3 SW environment (see ADR-0003).
- Base URL normalization: tolerates a trailing `/` and auto-appends `/v1` for OpenAI-compatible bases entered without a path (a bare origin) — a common pitfall in compatible-gateway scenarios; a base that already has a path is left untouched.

## 5. Selection Translation

1. The content script listens for `selectionchange` + `mouseup`; when there is a valid selection (non-whitespace, not a password field inside an input, length ≤ the 2000-character cap) it floats a small icon at the end of the selection.
2. Click the icon / hotkey → open the floating panel (mounted via `createShadowRootUi`, with Shadow DOM isolating site styles).
3. **Form detection** (`selection/` pure function): a selection of ≤ 3 words with no end-of-sentence punctuation → Dictionary Card, otherwise Translation Card; the two forms can be switched manually in the panel (detection is only the default).
4. Streaming rendering; the Dictionary Card asks the LLM to output an agreed-upon JSON (phonetics/part of speech/senses/example sentences), falling back to plain-text display if parsing fails.
5. Panel interactions: copy, retry, switch target language (this updates the default target language), drag to move the panel, and smart positioning based on available space above/below to avoid covering the body text (clicking elsewhere on the page closes it by default, Escape closes it).
6. Site exclusion list: disable the selection icon on specified sites (stored under the same site-rules set as the Auto-translate Site list).

## 6. Page Translation

- **Segmentation** (`segmenter/`): collect leaf block-level semantic units (`p/li/h1-h6/td/blockquote/dd/figcaption`, etc.) with normalized text, so each maps 1:1 to a DOM element; skip `code/pre/script/style/textarea/contenteditable`, hidden elements, and too-short (needs at least one letter) / link-only blocks. _(Short-block merging, over-long splitting, and same-target-language skipping via `chrome.i18n.detectLanguage` were planned here but are not implemented.)_
- **Viewport-first lazy translation**: translate the visible area and its vicinity first, with IntersectionObserver driving scroll-based loading; saves tokens and makes the first screen fast.
- **Batched requests**: multiple blocks are combined into one LLM call (with a numbered-marker protocol, responses backfilled by number), each request packed against a ≈1500-character input budget, concurrency default 3 (a code constant, not user-configurable).
- **Injection**: Bilingual Mode = insert a translation node with an extension-marker class after the source block; Translation-only Mode = hide the source node (without destroying it). **Translations are always written via `textContent`, never `innerHTML`** (LLM output is treated as untrusted input, to prevent XSS). One-click restore = remove all extension nodes + restore hidden nodes.
- **Dynamic content**: MutationObserver watches for newly added blocks and translates them incrementally while the page is in a translated state (SPA route changes reset state on URL change).
- **Progress and control**: a draggable in-page floating toolbar (progress, cancel, mode switch, restore, retry failed blocks).
- **Cache**: in-memory + `storage.session` (selection) / `storage.local` (page) LRU, key = hash(protocol + model + prompt version + target language + type + source text); re-translating after a page refresh returns instantly.
- **Auto-translate Site**: when a domain matches the list, translation triggers automatically once the page finishes loading.

## 7. Storage Schema (storage.local, with a version field for migration)

```ts
{
  version: 1,
  providers: ProviderProfile[],            // {id, name, protocol, baseUrl, apiKey, model, params?}
  defaults: { global: id, selection?: id, page?: id, image?: id },   // feature-level overrides (image = Screenshot Translation)
  general: { targetLang, secondaryTargetLang?, selectionTrigger, pageMode, uiLang },  // secondaryTargetLang: reserved, not yet wired to any UI; uiLang: UI language auto/en/zh
  siteRules: { autoTranslate: string[], disableSelection: string[] },
  prompts: { selectionDict?, selectionText?, pageBatch?, imageText? },  // unset = use built-in default
}
```

> The translation cache is **not** inside `AppSettings`; it lives under separate storage keys (`storage.session` for selection, `storage.local` for page), keyed by content, evicted by LRU, and clearable in one click; see "Cache design" in the roadmap for details.

Import/export: JSON files; export **excludes** the API Key by default — only when "Include keys" is checked does it export them, with a sensitivity warning. On import, `id` / `baseUrl` / `model` are required; `name` is optional (empty allowed, since profiles are bound by id).

## 8. Prompt Layer

Four built-in templates: `selectionDict` (Dictionary Card, JSON output), `selectionText` (Selection Translation), `pageBatch` (Page Translation, numbered-marker protocol), `imageText` (Screenshot Translation, added after this plan was aligned — see §13). Variables actually used: `{{text}}` and `{{targetLang}}`. The template layer also defines `{{sourceLang}}` / `{{siteTitle}}`, but callers don't populate them yet, so they currently render empty. Each can be overridden and restored to default in the settings Prompts section; the template version number is part of the cache key.

## 9. Permissions and Store Compliance

| manifest item | Purpose (justification material for review) |
|---|---|
| `content_scripts` matches `<all_urls>` | Selection needs to listen for selections on any page; Page needs to rewrite the DOM of any page |
| `host_permissions: <all_urls>` | Users set any custom LLM API Base URL, and the background needs to send requests to it |
| `permissions: storage` | Store config and translation cache on the local device |
| `permissions: contextMenus` | Right-click "Translate this page / Translate selection / Screenshot Translation" |
| `permissions: activeTab` | `captureVisibleTab` for Screenshot Translation — keeps working on Firefox after the optional `<all_urls>` host access is revoked (ADR-0006) |
| `commands` | Hotkeys |
| `browser_specific_settings.gecko` (Firefox only) | Pinned AMO extension id + `strict_min_version: 128.0` (immutable once listed — ADR-0005) |

> **Firefox note:** on Firefox the `<all_urls>` host permission is **optional and revocable**, so both features can be installed-but-inert until the user grants site access. This is handled by **Permission Onboarding** — a post-install onboarding page, popup/settings warning banners, a toolbar "!" badge, and runtime fallbacks — see ADR-0005 and `src/permissions.ts`.

Privacy policy highlights: all config and keys are stored only on the local device; the only network request goes to the API endpoint **configured by the user themselves**, carrying the text to be translated; the developer runs no servers and collects no data. UI i18n: zh-CN + en (bilingual store listing).

## 10. Testing and CI

- **vitest unit tests**: `llm/` (request construction for both protocols, SSE parsing including chunk-boundary cases, error normalization), `segmenter/` (HTML fixture segmentation), `selection/` (detection), `prompts/` (interpolation), storage migration.
- **Playwright E2E smoke**: chromium `--load-extension` loads the build output, with a local mock LLM server (can return SSE); cases: configure a Provider → selection shows the panel and the translation; Page Translation bilingual injection and restore.
- **GitHub Actions**: PR = typecheck + Biome + vitest + build + E2E; tag `v*` = build + `wxt zip` to produce Chrome/Edge packages + GitHub Release. The first store submission is manual; later ones can be automated.

## 11. Milestones

| Stage | Content | Acceptance |
|---|---|---|
| M0 Scaffolding | WXT+React+TS init, Biome, CI, four empty entrypoint shells | Loads and runs in dev mode |
| M1 Protocol layer | `llm/` dual adapters + SSE + unit tests; options page Provider CRUD + test connection | Unit tests green; settings page really connects to both protocols |
| M2 Selection | Icon/panel/hotkey, detection, Dictionary + Translation Card streaming | Selection works on any site |
| M3 Page | Segmentation, batching, lazy translation, bilingual / translation-only, restore, dynamic content, toolbar, cache | Works on three site types: news / docs / SPA |
| M4 Settings polish | Site lists, Prompt overrides, import/export, i18n, hotkey settings | Full settings available |
| M5 Release | E2E completion, icon assets, privacy policy, store submission (brand name finalized) | Approved by the stores |
| M6 Firefox / AMO | Firefox MV3 build + Permission Onboarding + Selenium smoke (ADR-0005; plan `2026-07-09-firefox-support.md`) | Built and verified; AMO submission pending |

## 12. Open Items

- Brand name and store title (finalized before M5; referenced in code via the `BRAND` constant).
- Debounce and cost-warning copy for the Selection "translate-on-select" mode (decided during M2 implementation).

## 13. Screenshot Translation

Phase 1 shipped after this plan was aligned; full rationale and trade-offs in ADR-0006.

- **Phase 1 — shipped**: drag-select a capture region over a frozen tab snapshot on injectable pages, streaming the result as a Translation Card in place; automatic fallback to an extension page on restricted pages (built-in PDF viewer, browser-internal pages), which also accepts pasted / dropped / chosen images; entries in the popup and the right-click context menu; resolved through the existing Feature Override chain (Selection / Page / Image), falling back to the Global Default Provider, and requiring a vision-capable model (a non-vision model error deep-links to Routing settings); `ChatRequest` and both protocol adapters are multimodal; a one-time first-use privacy notice; no translation cache for images.
- **Phase 2 — not implemented**: right-clicking an image element to translate it directly (`srcUrl` route — cross-origin fetch, lazy-load placeholders); a dedicated keyboard shortcut.
