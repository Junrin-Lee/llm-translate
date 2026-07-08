# Project Plan — LLM Translation Browser Extension

**English** · [简体中文](./plan.zh-CN.md)

> Status: aligned with the product owner (2026-07-06). For terminology see the root [CONTEXT.md](../CONTEXT.md); for key trade-offs see [docs/adr/](./adr/).

## 1. Product Definition

A streamlined take on Trancy: just two features — **Selection Translation** and **Page Translation** — with translation powered entirely by the user's own LLM API (BYOK; no self-hosted backend, no account system).

**Explicitly out of scope**: account binding, video/subtitle translation, vocabulary lists, PDF translation, and AI actions beyond selection (polishing/summarizing, etc.).

## 2. Aligned Decisions

| # | Decision Point | Conclusion |
|---|---|---|
| 1 | Release target | Publish to Chrome Web Store + Edge Add-ons (same MV3 build) |
| 2 | Tech stack | WXT + React + TypeScript, pnpm |
| 3 | Provider model | Multiple Provider Profiles; a Global Default Provider plus a per-feature Feature Override for Selection / Page |
| 4 | Selection trigger | Default "show icon on selection, click to translate"; supports a hotkey for direct translation; settings can switch to translate-on-select / hotkey-only |
| 5 | Selection content | Word/phrase → Dictionary Card (phonetics/part of speech/multiple senses/example sentences); sentence/paragraph → Translation Card; both stream their output |
| 6 | Page mode | Bilingual Mode is the default, switchable to Translation-only Mode (one-click restore) |
| 7 | Page trigger | Extension icon + hotkey + context menu + Auto-translate Site list |
| 8 | Permission model | content script always present on `<all_urls>` (see ADR-0001) |
| 9 | Data storage | Everything in `storage.local` only; config supports JSON import/export (see ADR-0002) |
| 10 | Prompt | Three built-in default templates, overridable in the settings Advanced area (variable interpolation), one-click restore to defaults |
| 11 | Naming | Working name `llm-translate`; brand name centrally managed as a constant, finalized before release |
| 12 | Engineering practices | vitest unit tests for core logic + Playwright E2E smoke + Biome + GitHub Actions |

## 3. Architecture

### 3.1 Entry Topology (WXT entrypoints)

```
entrypoints/
├── background.ts          # Service worker: the only LLM egress; menu/shortcut registration
├── content.tsx            # persistent content script: selection listening + panel UI + page-translation DOM engine
├── popup/                 # extension-icon popup: translate-page button, mode toggle, auto-translate-site switch, current Provider
└── options/               # settings page: Provider CRUD, trigger mode, Prompt templates, import/export
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
├── segmenter/             # ★ page DOM segmenter (pure logic, heavily unit-tested)
├── selection/             # selection classification: word/phrase vs sentence (pure logic, heavily unit-tested)
├── storage/               # storage.local schema, migration, import/export
├── prompts/               # three default templates + variable interpolation
└── ui/                    # panel, toolbar, popup/options shared components
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

- Error normalization: 401/403 (credentials), 404 (endpoint or model), 429 (rate limit; read `retry-after` and back off, retry ≤2 times), 5xx (retry), network errors, timeout (default 60s, configurable). Error messages are user-readable (Chinese and English).
- **No official SDK**; a hand-rolled lightweight client: symmetric across both protocols, small bundle size, zero adaptation for the MV3 SW environment (see ADR-0003).
- Base URL normalization: tolerates a trailing `/` and auto-appends `/v1` (can be disabled) — a common pitfall in compatible-gateway scenarios.

## 5. Selection Translation

1. The content script listens for `selectionchange` + `mouseup`; when there is a valid selection (non-whitespace, not a password field inside an input, length ≤ the 2000-character cap) it floats a small icon at the end of the selection.
2. Click the icon / hotkey → open the floating panel (mounted via `createShadowRootUi`, with Shadow DOM isolating site styles).
3. **Form detection** (`selection/` pure function): a selection of ≤ 3 words with no end-of-sentence punctuation → Dictionary Card, otherwise Translation Card; the two forms can be switched manually in the panel (detection is only the default).
4. Streaming rendering; the Dictionary Card asks the LLM to output an agreed-upon JSON (phonetics/part of speech/senses/example sentences), falling back to plain-text display if parsing fails.
5. Panel interactions: copy, retry, switch target language, drag to move the panel, and smart positioning based on available space above/below to avoid covering the body text (clicking elsewhere on the page closes it by default, Escape closes it).
6. Site exclusion list: disable the selection icon on specified sites (stored under the same site-rules set as the Auto-translate Site list).

## 6. Page Translation

- **Segmentation** (`segmenter/`): traverse block-level semantic units (`p/li/h1-h6/td/blockquote/dd`, etc.), merging short blocks and splitting over-long ones by text length; skip `code/pre/script/style/textarea/contenteditable`, link-only/number-only blocks, and blocks already in the target language (local detection via `chrome.i18n.detectLanguage`).
- **Viewport-first lazy translation**: translate the visible area and its vicinity first, with IntersectionObserver driving scroll-based loading; saves tokens and makes the first screen fast.
- **Batched requests**: multiple blocks are combined into one LLM call (with a numbered-marker protocol, responses backfilled by number), each request estimated at ≤ ~1500 output tokens, concurrency default 3, configurable.
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
  defaults: { global: id, selection?: id, page?: id },   // feature-level overrides
  general: { targetLang, secondaryTargetLang?, selectionTrigger, pageMode, uiLang },  // uiLang: UI language auto/en/zh
  siteRules: { autoTranslate: string[], disableSelection: string[] },
  prompts: { selectionDict?, selectionText?, pageBatch? },  // unset = use built-in default
}
```

> The translation cache is **not** inside `AppSettings`; it lives under separate storage keys (`storage.session` for selection, `storage.local` for page), keyed by content, evicted by LRU, and clearable in one click; see "Cache design" in the roadmap for details.

Import/export: JSON files; export **excludes** the API Key by default — only when "Include keys" is checked does it export them, with a sensitivity warning. On import, `id` / `baseUrl` / `model` are required; `name` is optional (empty allowed, since profiles are bound by id).

## 8. Prompt Layer

Three built-in templates: `selectionDict` (Dictionary Card, JSON output), `selectionText` (Selection Translation), `pageBatch` (Page Translation, numbered-marker protocol). Variables: `{{text}}`, `{{targetLang}}`, `{{sourceLang?}}`, `{{siteTitle?}}`. Each can be overridden and restored to default in the settings Advanced area; the template version number is part of the cache key.

## 9. Permissions and Store Compliance

| manifest item | Purpose (justification material for review) |
|---|---|
| `content_scripts` matches `<all_urls>` | Selection needs to listen for selections on any page; Page needs to rewrite the DOM of any page |
| `host_permissions: <all_urls>` | Users set any custom LLM API Base URL, and the background needs to send requests to it |
| `permissions: storage` | Store config and translation cache on the local device |
| `permissions: contextMenus` | Right-click "Translate this page / Translate selection" |
| `commands` | Hotkeys |

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
| M5 Release | E2E completion, icon assets, privacy policy, dual-store submission (brand name finalized) | Approved by both stores |

## 12. Open Items

- Brand name and store title (finalized before M5; referenced in code via the `BRAND` constant).
- Debounce and cost-warning copy for the Selection "translate-on-select" mode (decided during M2 implementation).
