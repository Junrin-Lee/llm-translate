# LLM Translation Extension — Overall Development Plan (Roadmap)

**English** · [简体中文](./2026-07-06-llm-translate-roadmap.zh-CN.md)

> **Scope:** This document is the full M0–M5 task breakdown and interface contract, based on [docs/plan.md](../../plan.md) (solution) and [CONTEXT.md](../../../CONTEXT.md) (terminology).
> **Execution:** Before starting each milestone, generate that milestone's detailed implementation plan based on this document (superpowers:writing-plans format, with complete TDD code steps), stored in this directory as `YYYY-MM-DD-m<N>-<name>.md`; then execute task by task with superpowers:subagent-driven-development or executing-plans.
> **Interface contract:** The signatures in the "Interface contract" section of this document are the authoritative cross-task definitions; subsequent detailed plans must not rename them arbitrarily. When a change is truly needed, update this document first.

**Goal:** An MV3 extension published to the Chrome Web Store + Edge Add-ons: Selection Translation + Page Translation, BYOK with support for OpenAI-compatible and Anthropic-compatible protocols.

**Architecture:** WXT + React + TS; the content script runs persistently on `<all_urls>` and handles UI and DOM; all LLM requests are issued only by the background service worker; content ↔ background stream results over a Port channel; pure-logic modules (protocol, segmentation, classification, prompt) are decoupled from the entrypoints, with a focus on unit tests.

**Tech Stack:** WXT, React 19, TypeScript (strict), pnpm, Biome, vitest (+ WxtVitest/fake-browser), Playwright, GitHub Actions.

> **Progress (as of 2026-07-07):** The bulk of M0–M5 is complete (175 unit tests + 4 Playwright E2E tests passing); only the **actual submission** to the Chrome/Edge stores remains (requires a developer account, done manually by the maintainer). The ✅ / ⬜ on each milestone heading below indicates its current status.
>
> **Note (kept historical):** This document is a dated planning snapshot. A few task descriptions below list sub-features that were planned but ultimately **not implemented**; those are flagged inline with _(implemented: …)_ notes rather than rewritten, so the original intent stays visible.

## Global constraints (implicitly followed by every task)

- TypeScript `strict: true`; package manager pnpm (pinned to 9.15.9 via `packageManager`); Node 20 (pnpm 10/11 require Node 22+, so we stay on pnpm 9).
- All network requests to the LLM API are allowed only in the background; the content script must not fetch external services.
- Translations are always written to the DOM via `textContent`; `innerHTML` is forbidden (LLM output is treated as untrusted input).
- The API Key must not appear in logs, error messages, or exception stack traces; exports exclude the Key by default.
- The brand name is referenced via the `BRAND` constant in `src/brand.ts`; hardcoded strings are forbidden.
- Pure-logic modules (`src/llm|segmenter|selection|prompts|translator|storage`) follow TDD; UI tasks rely mainly on manual acceptance checklists.
- Each task is its own commit, Conventional Commits (`feat:`/`fix:`/`test:`/`chore:`).
- CI (typecheck + Biome + vitest + build) must be green for a task to be considered complete.

## File structure overview

```
├── wxt.config.ts / tsconfig.json / biome.json / vitest.config.ts / package.json
├── entrypoints/
│   ├── background.ts            # message routing + LLM egress + menus/shortcuts
│   ├── content.tsx              # selection + page DOM engine + Shadow DOM UI mounting
│   ├── popup/ (index.html, App.tsx)
│   └── options/ (index.html, App.tsx, components/)
├── src/
│   ├── brand.ts / languages.ts
│   ├── i18n/       messages.ts, index.ts, useI18n.ts (in-app en/zh strings)
│   ├── llm/        types.ts, sse.ts, base-url.ts, openai.ts, anthropic.ts, http.ts, client.ts
│   ├── messaging/  protocol.ts, handler.ts, port-client.ts
│   ├── storage/    schema.ts, index.ts, import-export.ts
│   ├── prompts/    templates.ts, index.ts
│   ├── selection/  classify.ts, dict-result.ts
│   ├── segmenter/  index.ts
│   ├── translator/ batch.ts, orchestrator.ts, cache.ts, inject.ts
│   └── ui/         selection/ (icon · panel), page/ (toolbar · store)
├── tests/          # *.test.ts mirroring src/; fixtures/
├── e2e/            # Playwright + mock-llm server
└── .github/workflows/ ci.yml, release.yml
```

## Interface contract (authoritative definitions)

```ts
// src/llm/types.ts
export type Protocol = 'openai' | 'anthropic';
export interface ProviderProfile {
  id: string; name: string; protocol: Protocol;
  baseUrl: string; apiKey: string; model: string;
  params?: { temperature?: number; maxTokens?: number; timeoutMs?: number };  // timeout defaults to 60_000
}
export interface ChatRequest {
  system: string; user: string; model: string;
  maxTokens?: number; temperature?: number;
}
export interface ChatResult { text: string; usage?: { inputTokens: number; outputTokens: number } }
export type LlmErrorCode =
  | 'auth' | 'not_found' | 'rate_limit' | 'server'
  | 'network' | 'timeout' | 'aborted' | 'bad_response';
export class LlmError extends Error { code: LlmErrorCode; status?: number }
export interface TestResult { ok: boolean; latencyMs?: number; error?: LlmError }
export interface TranslationClient {
  stream(req: ChatRequest, onDelta: (text: string) => void, signal?: AbortSignal): Promise<ChatResult>;
  complete(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult>;
  listModels(): Promise<string[]>;
  testConnection(): Promise<TestResult>;
}

// src/llm/client.ts
export function createClient(profile: ProviderProfile): TranslationClient;

// src/llm/sse.ts
export async function* parseSse(stream: ReadableStream<Uint8Array>):
  AsyncGenerator<{ event?: string; data: string }>;

// src/llm/base-url.ts — normalization rules: strip trailing slash; append /v1 for openai when no path
export function normalizeBaseUrl(raw: string, protocol: Protocol): string;
export function endpointFor(base: string, protocol: Protocol, kind: 'chat' | 'models'): string;

// src/storage/schema.ts
export interface GeneralSettings {
  targetLang: string; secondaryTargetLang?: string;
  selectionTrigger: 'icon' | 'instant' | 'shortcut-only';
  pageMode: 'bilingual' | 'replace';
  uiLang: 'auto' | 'en' | 'zh';   // UI language (T4.3 i18n)
}
export interface SiteRules { autoTranslate: string[]; disableSelection: string[] }
export interface PromptOverrides { selectionDict?: string; selectionText?: string; pageBatch?: string }
export interface AppSettings {
  version: 1; providers: ProviderProfile[];
  defaults: { global: string | null; selection?: string; page?: string };
  general: GeneralSettings; siteRules: SiteRules; prompts: PromptOverrides;
}

// src/storage/index.ts
export function getSettings(): Promise<AppSettings>;
export function updateSettings(patch: Partial<AppSettings>): Promise<void>;
export function watchSettings(cb: (s: AppSettings) => void): () => void;
export function resolveProfile(feature: 'selection' | 'page'): Promise<ProviderProfile | null>;

// src/storage/import-export.ts
export function exportSettings(s: AppSettings, includeKeys: boolean): string;
export function importSettings(json: string): Promise<void>;   // validate + merge-write

// src/prompts/index.ts
export type PromptKind = 'selectionDict' | 'selectionText' | 'pageBatch';
export interface PromptVars { text: string; targetLang: string; sourceLang?: string; siteTitle?: string }
export function renderPrompt(kind: PromptKind, vars: PromptVars, overrides?: PromptOverrides):
  { system: string; user: string; version: string };   // version participates in the cache key

// src/messaging/protocol.ts —— Port name constants + message types (code is authoritative; routing logic in src/messaging/handler.ts for easier unit testing)
export type BgRequest =
  | { kind: 'translate-stream'; feature: 'selection'; promptKind: 'selectionDict' | 'selectionText'; vars: PromptVars; bypassCache?: boolean }
  | { kind: 'translate-batch'; feature: 'page'; payload: string; vars: Omit<PromptVars, 'text'> }  // payload = already-encoded batch, encoding/decoding belongs to the orchestrator
  | { kind: 'list-models'; profileId: string }
  | { kind: 'test-connection'; profileId: string };
export type BgEvent =
  | { type: 'delta'; text: string }
  | { type: 'batch-result'; text: string }
  | { type: 'done'; usage?: ChatResult['usage'] }
  | { type: 'models'; models: string[] }
  | { type: 'test-result'; ok: boolean; latencyMs?: number; errorCode?: LlmErrorCode; message?: string }
  | { type: 'error'; code: LlmErrorCode; message: string };
// Also one-off messages from background/popup → content:
//   ContentMessage = { type: 'open-selection-panel' | 'translate-page' | 'get-page-status' }
//   PageStatusReply = 'idle' | 'translating' | 'done';  TabMessage = { type: 'page-status-changed'; status: PageStatusReply }

// src/selection/classify.ts
export function classifySelection(text: string): 'dict' | 'text';
// src/selection/dict-result.ts
export interface DictResult { word: string; phonetic?: string; senses: { pos?: string; meaning: string }[]; examples?: string[] }
export function parseDictResult(raw: string): DictResult | null;  // null = fall back to plain text

// src/segmenter/index.ts
export interface Segment { id: number; element: Element; text: string }
export function collectSegments(root: ParentNode): Segment[];

// src/translator/batch.ts —— numbered-marker protocol
export function encodeBatch(items: { id: number; text: string }[]): string;
export function decodeBatch(raw: string): Map<number, string>;   // tolerates missing numbers/out-of-order/extras

// src/translator/orchestrator.ts
export interface PageTranslateController { pause(): void; resume(): void; cancel(): void }
export function translateSegments(
  segments: Segment[],
  opts: { concurrency: number; onResult: (id: number, text: string) => void;
          onProgress: (done: number, total: number) => void; onError: (e: LlmError) => void }
): PageTranslateController;

// src/translator/cache.ts
export function cacheGet(key: string): Promise<string | null>;
export function cacheSet(key: string, value: string): Promise<void>;
export function cacheKey(p: { protocol: string; model: string; promptVersion: string; targetLang: string; kind: string; text: string }): string;
```

---

## M0 Scaffolding (loadable, CI green) ✅

| Task | Content | Files | Acceptance | Deps | Est |
|---|---|---|---|---|---|
| **T0.1** Project initialization | After `pnpm dlx wxt@latest init` (react-ts template), adjust: strict tsconfig, `@/` alias, `src/brand.ts`, four empty entrypoint stubs (background/content/popup/options) | package.json, wxt.config.ts, tsconfig.json, entrypoints/*, src/brand.ts | Loads in Chrome developer mode after `pnpm dev`, all four entrypoints without errors | — | M |
| **T0.2** Biome | biome.json (recommended + organize imports), scripts: `lint`/`format` | biome.json, package.json | `pnpm lint` 0 errors | T0.1 | S |
| **T0.3** vitest | vitest.config.ts (WxtVitest plugin + fake-browser), one smoke test | vitest.config.ts, tests/smoke.test.ts | `pnpm test` green | T0.1 | S |
| **T0.4** manifest & permissions | permissions: `storage`, `contextMenus`; host_permissions `<all_urls>`; content script matches `<all_urls>`; commands skeleton (`translate-selection`/`translate-page`); name references BRAND | wxt.config.ts, entrypoints/content.tsx | chrome://extensions shows correct permissions; shortcuts appear in chrome://extensions/shortcuts | T0.1 | S |
| **T0.5** CI | ci.yml: PR/push → pnpm install + typecheck + lint + test + `wxt build`; release.yml skeleton (tag-triggered, build only for now) | .github/workflows/ci.yml, release.yml | CI all green on PRs | T0.2-3 | S |

## M1 Protocol layer & Provider management (options page really connects to both protocols) ✅

| Task | Content | Files | Acceptance | Deps | Est |
|---|---|---|---|---|---|
| **T1.1** Type layer | All types from the contract's `src/llm/types.ts` + `LlmError` | src/llm/types.ts | typecheck passes; LlmError supports instanceof | T0 | S |
| **T1.2** SSE parser | `parseSse`: assemble events line by line; covers split-packet fragmentation, multiple events per packet, CRLF, `event:` lines, `[DONE]` not handled specially (left to the adapter) | src/llm/sse.ts, tests/llm/sse.test.ts | unit tests: ≥8 packet-boundary cases green | T1.1 | M |
| **T1.3** Base URL normalization | `normalizeBaseUrl`/`endpointFor`; rules: strip trailing `/`; append `/v1` for openai when no path, chat=`{base}/chat/completions`, models=`{base}/models`; anthropic chat=`{base}/v1/messages` (no duplication if base already contains `/v1`), models likewise | src/llm/base-url.ts, tests/llm/base-url.test.ts | unit tests: official/gateway/with-path/with-trailing-slash matrix green | T1.1 | S |
| **T1.4** OpenAI adapter | request construction (Bearer, system as first message, `stream:true`), `choices[0].delta.content` deltas, `[DONE]` termination, non-streaming `complete`, HTTP→LlmError mapping | src/llm/openai.ts, tests/llm/openai.test.ts | mock-fetch unit tests: streaming/non-streaming/401/404/429/500/timeout/abort | T1.2-3 | M |
| **T1.5** Anthropic adapter | headers: `x-api-key`+`anthropic-version: 2023-06-01`+`anthropic-dangerous-direct-browser-access: true`; top-level `system`; `max_tokens` required (default 4096 or params.maxTokens); `content_block_delta`/`text_delta` deltas, `message_stop` termination | src/llm/anthropic.ts, tests/llm/anthropic.test.ts | same case matrix as T1.4, green | T1.2-3 | M |
| **T1.6** Client factory | `createClient` dispatches by protocol; shared retry (read retry-after on 429, 5xx, ≤2 exponential backoffs); `testConnection` (1-token request to measure latency); `listModels` (returns `[]` on failure, does not throw) | src/llm/client.ts, tests/llm/client.test.ts | unit tests: retry count/backoff/dispatch across both protocols | T1.4-5 | M |
| **T1.7** Storage layer | schema defaults, `getSettings/updateSettings/watchSettings/resolveProfile` (override → global fallback), version migration skeleton, import/export (includeKeys toggle, import validation) | src/storage/*, tests/storage/*.test.ts | fake-browser unit tests: read/write, fallback, export redaction, error on invalid-JSON import | T1.1 | M |
| **T1.8** Prompt layer | three built-in templates (dictionary JSON output / selection translation / page batch numbered protocol) + `renderPrompt` interpolation + overrides taking effect + version constant | src/prompts/*, tests/prompts/*.test.ts | unit tests: interpolation / override / unknown variables left as-is | T1.1 | S |
| **T1.9** background routing | `src/messaging/protocol.ts` + background: onConnect handles the 4 kinds of BgRequest; translate-stream forwards deltas as BgEvent via `resolveProfile`+`renderPrompt`+`createClient.stream`; AbortController bound to port disconnect | src/messaging/protocol.ts, entrypoints/background.ts, tests/messaging/protocol.test.ts | protocol encode/decode unit tests green; manual: options console receives deltas over the port | T1.6-8 | M |
| **T1.10** Provider CRUD UI | options page: Provider list/add/edit (protocol, baseUrl, key masking, model input)/delete (default-item protection)/set as Global Default/Selection & Page override dropdowns | entrypoints/options/*, src/ui/* | manual checklist: full CRUD works; persists across refresh | T1.7 | L |
| **T1.11** Connectivity verification | "Test connection" and "Fetch models" buttons go through the background; errors shown as readable text by LlmErrorCode | entrypoints/options/*, entrypoints/background.ts | connect once each to a real OpenAI-compatible + Anthropic-compatible endpoint (smoke record) | T1.9-10 | S |

## M2 Selection Translation (works on any site) ✅

| Task | Content | Files | Acceptance | Deps | Est |
|---|---|---|---|---|---|
| **T2.1** Selection classification | `classifySelection`: ≤3 words and no sentence-ending punctuation → `dict` (CJK uses a character-count threshold); the 2000-character cap check is exported separately | src/selection/classify.ts, tests/selection/classify.test.ts | Chinese/English/mixed fixtures unit tests green | — | S |
| **T2.2** Selection icon | content: `selectionchange`+`mouseup` debounce; small icon positioned at the end of the selection (`createShadowRootUi`); excludes input/textarea/contenteditable and password fields; not mounted on `disableSelection` sites; `instant`/`shortcut-only` mode branches | entrypoints/content.tsx, src/ui/SelectionIcon.tsx | manual checklist: icon works on Google/GitHub/Zhihu, does not appear in input fields | T1.7 | M |
| **T2.3** Floating panel | floating panel component: positioning (flips at viewport edges), loading skeleton, close on Esc/outside-click, pin, copy, retry, target-language switch _(implemented: switching updates the default target language rather than being panel-local)_ | src/ui/TranslatePanel.tsx | manual checklist passes item by item | T2.2 | M |
| **T2.4** Streaming wiring | content-side port client (`useTranslateStream` hook): sends translate-stream, renders deltas incrementally, error state, reconnects once on disconnect _(implemented: `src/messaging/port-client.ts` surfaces an error on disconnect; there is no auto-reconnect)_ | src/ui/useTranslateStream.ts | manual: real API streams text; going offline shows an error state | T1.9, T2.3 | M |
| **T2.5** Dictionary Card | `parseDictResult` (tolerates markdown code fences) + Dictionary Card component (phonetics/part of speech/senses/examples); falls back to plain text on parse failure; manual toggle between dictionary ⇄ translation inside the card | src/selection/dict-result.ts, src/ui/DictCard.tsx, tests/selection/dict-result.test.ts | unit tests: standard JSON / fence-wrapped / bad JSON → null; manual: a word produces a Dictionary Card | T2.4 | M |
| **T2.6** Keyboard shortcuts | `translate-selection` command → background forwards to the current tab; `shortcut-only`/`instant` mode wiring | entrypoints/background.ts, entrypoints/content.tsx | manual: all three trigger modes behave per settings | T2.4 | S |
| **T2.7** Selection settings | options: trigger-mode radio, target-language selection, disabled-site list editing (add/remove domains) | entrypoints/options/* | manual: setting changes take effect immediately (watchSettings) | T2.2 | S |

## M3 Page Translation (works on three site types: news/docs/SPA) ✅

| Task | Content | Files | Acceptance | Deps | Est |
|---|---|---|---|---|---|
| **T3.1** Segmenter | `collectSegments`: traverses `p/li/h1-h6/td/blockquote/dd/figcaption` etc.; merges short blocks (<20 chars merged into a neighbor), splits over-long ones (>1000 chars by sentence); skips code/pre/script/style/textarea/contenteditable/link-only/number-only; visibility filtering _(implemented: leaf-block collection + skip/visibility/too-short & link-only filtering only; short-block merge and over-long split were not built)_ | src/segmenter/index.ts, tests/segmenter/*.test.ts + fixtures/*.html | 4 fixture sets (news page/table/code docs/nested list) unit tests green | — | L |
| **T3.2** Batch protocol | `encodeBatch` (`@@n@@` line markers) + `decodeBatch` (skip missing numbers, tolerate out-of-order, drop extras) | src/translator/batch.ts, tests/translator/batch.test.ts | unit tests: normal/missing-number/out-of-order/run-together cases green | — | S |
| **T3.3** Orchestrator | `translateSegments`: batches by token budget (estimate len/2, ≤1500 output), concurrency pool (default 3), retry failed batches once, `chrome.i18n.detectLanguage` skips blocks already in the target language, AbortController global cancel _(implemented: batching + concurrency pool + global cancel; the `detectLanguage` same-language skip was not built)_ | src/translator/orchestrator.ts, tests/translator/orchestrator.test.ts | unit tests (mock client): batching/concurrency cap/cancel/skip | T3.1-2, T1.6 | L |
| **T3.4** Cache | see "Cache design" below; centralized background cache + in-panel memory, keyed by content, LRU eviction, `cacheKey` includes mode/promptVersion, bypassed by Retry | src/translator/cache.ts, tests/translator/cache.test.ts | unit tests: hit/eviction/clear; manual: switching dict/text and refreshing the page return instantly | T1.7 | M |
| **T3.5** DOM injection | Bilingual Mode: insert a `data-llmt` marker node after the original block (textContent); Translation-only Mode: hide the original block; `restorePage()` full restore; hot mode switching | entrypoints/content.tsx, src/ui/inject.ts, tests/ui/inject.test.ts (happy-dom) | unit tests: injection/restore idempotent; manual: switching between the two modes leaves no residue | T3.1 | M |
| **T3.6** Lazy translation | IntersectionObserver: viewport ±1 screen enqueued first, appended on scroll; hooks into the orchestrator queue | entrypoints/content.tsx | manual: on a long page the first screen appears first, more is translated as you scroll | T3.3, T3.5 | M |
| **T3.7** Dynamic content | MutationObserver incrementally collects blocks into the queue; SPA URL changes (history hook) reset the translation state | entrypoints/content.tsx | manual: SPA page navigation on Twitter/official docs works correctly | T3.6 | M |
| **T3.8** In-page toolbar | floating toolbar: progress n/N, pause/resume, cancel, Bilingual ⇄ Translation-only, restore, close _(implemented: progress, cancel, mode toggle, restore, retry-failed; `pause()/resume()` exist in the orchestrator but are not wired to the toolbar)_ | src/ui/PageToolbar.tsx | manual checklist passes item by item | T3.6 | M |
| **T3.9** popup | Translate this page (toggle between trigger/restore states), mode selection, Auto-translate Site toggle, display of the currently active Provider, jump to settings _(implemented: without the active-Provider display)_ | entrypoints/popup/* | manual checklist passes item by item | T3.5 | M |
| **T3.10** Trigger wrap-up | context menu (Translate this page/Translate selection), `translate-page` shortcut, autoTranslate sites translate on load | entrypoints/background.ts, entrypoints/content.tsx | manual: all four trigger paths work | T3.8-9 | S |

## M4 Settings refinement ✅

| Task | Content | Files | Acceptance | Deps | Est |
|---|---|---|---|---|---|
| **T4.1** Prompt editor | three template textareas, variable descriptions, live preview (renderPrompt), restore defaults | entrypoints/options/* | manual: overrides take effect and the cache key changes (version) | T1.8 | M |
| **T4.2** Import/export UI | export downloads JSON (excludes Key by default; checkbox to include Key + sensitive-data warning); import validates the file + confirms overwrite | entrypoints/options/* | manual: export/import round-trip is equivalent; redaction is correct | T1.7 | S |
| **T4.3** i18n | WXT i18n module; two message sets, zh_CN + en; all UI strings go through i18n keys | public/_locales/*, all UI files | UI follows when the browser language changes; no hardcoded strings (grep check) _(implemented as an in-app i18n module at `src/i18n/*` with en/zh catalogs and `t()`/`useT()`, not WXT `public/_locales/`; `browser.i18n` is used only to resolve the auto UI language)_ | M2-3 | M |
| **T4.4** Miscellaneous wrap-up | cache-usage display / one-click clear; shortcut instructions + link to `chrome://extensions/shortcuts` (MV3 cannot modify them programmatically); debounce parameter for "translate on select" and cost-warning copy _(implemented: cache usage display + one-click clear only; the in-settings shortcut instructions/link and the "translate on select" debounce & cost-warning copy were not built — the README/INSTALL still point users to `chrome://extensions/shortcuts` for rebinding)_ | entrypoints/options/* | manual checklist passes item by item | T3.4 | S |

## M5 Quality & store launch ✅ (except the actual store submission)

> Status: T5.1/T5.2 E2E (Playwright loads the extension + mock LLM + selection/page smoke + CI e2e job) ✅;
> T5.3 brand finalized (LLM Translate) + icons (see `assets/logo/`) + store screenshots (`pnpm screenshots` → `store-assets/screenshots/`) + Chinese/English listing (`store-assets/listing.*.md`) ✅;
> T5.4 privacy policy (`docs/privacy-policy.md`) + permission justification (`store-assets/justifications.md`) ✅;
> T5.5 release.yml (tag→build→zip→GH Release) ✅, current version 0.1.1 ✅. **Only remaining to-do: first manual submission to CWS + Edge (requires a maintainer account).**

| Task | Content | Files | Acceptance | Deps | Est |
|---|---|---|---|---|---|
| **T5.1** E2E scaffolding | Playwright chromium `--load-extension` loads the `wxt build` output; `e2e/mock-llm.ts` local server (both protocols, SSE-capable); case 1: configure Provider → select text → panel shows translation | e2e/*, playwright.config.ts | local `pnpm e2e` green | M2 | L |
| **T5.2** E2E page + CI | case 2: Page Translation of a fixture page → bilingual injection → restore; add an e2e job to CI | e2e/page.spec.ts, ci.yml | CI with E2E all green | T5.1, M3 | M |
| **T5.3** Branding & assets | finalize brand name (single change in `src/brand.ts`), icons in all sizes (16-128), store screenshots, zh/en listing copy | src/brand.ts, public/icon/*, store-assets/* | assets complete and checked against store specs | M4 | M |
| **T5.4** Compliance docs | privacy policy page (GitHub Pages or static), justification copy for the purpose of `<all_urls>`/host_permissions/storage/contextMenus | docs/privacy-policy.md, store-assets/justifications.md | self-review against CWS policy passes | T5.3 | S |
| **T5.5** Release | release.yml complete (tag→build→`wxt zip`→GH Release with artifacts); first manual submission to CWS + Edge Add-ons | .github/workflows/release.yml | both store submissions succeed and enter review | T5.2-4 | M |

## Post-milestone enhancements (user-feedback-driven, post-M5)

- **Page-translation failure retry**: blocks in a failed batch are marked `⚠` and can be **retried per block by clicking**, or **retried all at once via the toolbar's "Retry N failed"**; already-successful translations are kept, and on retry the background re-reads settings (fixing the key/URL takes effect immediately). Related: `src/translator/inject.ts` (countErrored / collectErroredElements / erroredSourceOf), `src/ui/page/store.ts` (retryFailed + delegated click).
- **Draggable selection panel + smart positioning**: the panel can be dragged away by its title bar to avoid covering the body text; it opens into whichever of the space above/below is larger, and the body height is capped to the available space so it doesn't overflow the screen. Shared drag hook `src/ui/useDrag.ts` (shared by the toolbar and the panel); positioning pure function `src/ui/selection/panel-position.ts` (with unit tests).

## Dependencies and parallelization opportunities

```
M0 → M1 (T1.1 → {T1.2,T1.3} → {T1.4,T1.5} → T1.6 → T1.9 → T1.11; T1.7/T1.8 can run in parallel; T1.10 depends on T1.7)
M1 → M2 (T2.1 can start early in parallel)
M1 → M3 (T3.1/T3.2 pure logic can run in parallel with M2; from T3.3 on, depends on T1.6)
M2+M3 → M4 → M5 (T5.1 depends only on M2, can start early)
```

**Estimate summary:** S = ≤0.5 day, M = 1 day, L = 1.5-2 days; totaling roughly **35-40 person-days**.

## Cache design (discussed and confirmed with the product owner on 2026-07-07)

Translation results are stable for a fixed input, so we **key by content, evict by capacity (LRU), and do not expire by time**; "force refresh" is handled by Retry (which bypasses the cache). Two layers:

- **Layer 1 · in-panel memory** (built with M2 selection, zero storage): the panel keeps the results of both dict / text modes in component state, so switching modes or looking back and forth is an **instant hit with zero requests**; only switching the target language invalidates it. This directly eliminates the "switch = resend" experience problem.
- **Layer 2 · centralized background cache** (T3.4): all requests go through a single egress and are cached in the background keyed by `hash(protocol + model + promptVersion + targetLang + mode + sourceText)`. On a hit, the full result is sent back as a single delta + done (no change to the message protocol, no API call); on a miss, it streams and is written to the cache when finished.
  - Storage medium: selection uses **`chrome.storage.session`** (in-memory, auto-cleared when the browser closes, never written to disk, best for privacy); Page Translation uses **`storage.local`** (persistent across sessions, large volume).
  - Capacity: LRU cap (≈5MB or N entries), paired with T4.4's usage display + one-click clear.
- **Explicitly no Redis / any server-side cache**: it would violate the core positioning of no-backend (ADR-0001) and data-only-on-device (ADR-0002); client-side storage already covers the need at no cost.

## Milestone acceptance (from docs/plan.md §11)

- M0: loads and runs in dev mode, CI green
- M1: unit tests green; settings page really connects to both protocols
- M2: Selection Translation works on any site (three-site manual checklist)
- M3: Page Translation works on all three site types: news/docs/SPA
- M4: all settings functional, i18n with no hardcoding
- M5: approved on both stores

## Risks and research flags

- **MV3 SW suspension**: the SW is killed during a very long streaming task → Port messages and an in-flight fetch can keep it alive; verify a 5-minute long stream when implementing T1.9; if that's not enough, add a port heartbeat.
- **decodeBatch fault-tolerance for weak models** (T3.2): the marker protocol may drift in format on small models; unit tests cover run-together/missing-number, and if necessary we switch to JSON-array output in M3 for an A/B test.
- **CWS review cycle** (T5.5): review of an `<all_urls>` extension may take 1-3 weeks, so prepare the justification in advance (T5.4).
