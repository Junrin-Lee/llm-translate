# LLM 翻译扩展 — 总体开发计划(Roadmap)

[English](./2026-07-06-llm-translate-roadmap.md) · **简体中文**

> **定位**:本文档是 M0–M5 全量任务拆分与接口契约,依据 [docs/plan.md](../../plan.zh-CN.md)(方案)与 [CONTEXT.md](../../../CONTEXT.zh-CN.md)(术语)。
> **执行方式**:每个里程碑开工前,基于本文档生成该里程碑的详细实现计划(superpowers:writing-plans 格式,含完整 TDD 代码步骤),存放于本目录 `YYYY-MM-DD-m<N>-<name>.md`;随后用 superpowers:subagent-driven-development 或 executing-plans 逐任务执行。
> **接口契约**:本文档「接口契约」一节的签名是跨任务的权威定义,后续详细计划不得擅自改名;确需变更时先改本文档。

**Goal:** 上架 Chrome Web Store + Edge Add-ons 的 MV3 扩展:划词翻译 + 全文翻译,BYOK 支持 OpenAI 兼容与 Anthropic 兼容协议。

**Architecture:** WXT + React + TS;content script 常驻 `<all_urls>` 负责 UI 与 DOM;所有 LLM 请求仅由 background service worker 发出;content ↔ background 用 Port 通道传流式结果;纯逻辑模块(协议、分块、判定、prompt)与入口解耦,重点单测。

**Tech Stack:** WXT、React 19、TypeScript(strict)、pnpm、Biome、vitest(+ WxtVitest/fake-browser)、Playwright、GitHub Actions。

> **进度(截至 2026-07-07):** M0–M5 主体已完成(164 单测 + 2 Playwright E2E 冒烟通过);仅剩 Chrome/Edge 商店的**实际提交**(需开发者账号,由维护者手动完成)。下方各里程碑标题的 ✅ / ⬜ 表示当前状态。

## 全局约束(每个任务隐含遵守)

- TypeScript `strict: true`;包管理 pnpm(经 `packageManager` 固定 9.15.9);Node 20(pnpm 10/11 需 Node 22+,故留在 pnpm 9)。
- 所有对 LLM API 的网络请求只允许出现在 background;content script 禁止 fetch 外部服务。
- 译文写入 DOM 一律 `textContent`,禁止 `innerHTML`(LLM 输出按不可信输入处理)。
- API Key 不得出现在日志、错误信息、异常堆栈;导出默认不含 Key。
- 品牌名经 `src/brand.ts` 的 `BRAND` 常量引用,禁止硬编码字符串。
- 纯逻辑模块(`src/llm|segmenter|selection|prompts|translator|storage`)走 TDD;UI 任务以手动验收清单为主。
- 每任务独立 commit,Conventional Commits(`feat:`/`fix:`/`test:`/`chore:`)。
- CI(typecheck + Biome + vitest + build)必须绿才算任务完成。

## 文件结构总图

```
├── wxt.config.ts / tsconfig.json / biome.json / vitest.config.ts / package.json
├── entrypoints/
│   ├── background.ts            # 消息路由 + LLM 出口 + 菜单/快捷键
│   ├── content.tsx              # 划词 + 全文 DOM 引擎 + Shadow DOM UI 挂载
│   ├── popup/ (index.html, App.tsx)
│   └── options/ (index.html, App.tsx, components/)
├── src/
│   ├── brand.ts / languages.ts
│   ├── i18n/       messages.ts, index.ts, useI18n.ts(应用内 en/zh 文案)
│   ├── llm/        types.ts, sse.ts, base-url.ts, openai.ts, anthropic.ts, http.ts, client.ts
│   ├── messaging/  protocol.ts, handler.ts, port-client.ts
│   ├── storage/    schema.ts, index.ts, import-export.ts
│   ├── prompts/    templates.ts, index.ts
│   ├── selection/  classify.ts, dict-result.ts
│   ├── segmenter/  index.ts
│   ├── translator/ batch.ts, orchestrator.ts, cache.ts, inject.ts
│   └── ui/         selection/(图标·浮层), page/(工具条·store)
├── tests/          # 与 src/ 镜像的 *.test.ts;fixtures/
├── e2e/            # Playwright + mock-llm server
└── .github/workflows/ ci.yml, release.yml
```

## 接口契约(权威定义)

```ts
// src/llm/types.ts
export type Protocol = 'openai' | 'anthropic';
export interface ProviderProfile {
  id: string; name: string; protocol: Protocol;
  baseUrl: string; apiKey: string; model: string;
  params?: { temperature?: number; maxTokens?: number; timeoutMs?: number };  // timeout 默认 60_000
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

// src/llm/base-url.ts — 规范化规则:去尾斜杠;openai 无 path 时补 /v1
export function normalizeBaseUrl(raw: string, protocol: Protocol): string;
export function endpointFor(base: string, protocol: Protocol, kind: 'chat' | 'models'): string;

// src/storage/schema.ts
export interface GeneralSettings {
  targetLang: string; secondaryTargetLang?: string;
  selectionTrigger: 'icon' | 'instant' | 'shortcut-only';
  pageMode: 'bilingual' | 'replace';
  uiLang: 'auto' | 'en' | 'zh';   // 界面语言(T4.3 i18n)
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
export function importSettings(json: string): Promise<void>;   // 校验 + 合并写入

// src/prompts/index.ts
export type PromptKind = 'selectionDict' | 'selectionText' | 'pageBatch';
export interface PromptVars { text: string; targetLang: string; sourceLang?: string; siteTitle?: string }
export function renderPrompt(kind: PromptKind, vars: PromptVars, overrides?: PromptOverrides):
  { system: string; user: string; version: string };   // version 参与缓存 key

// src/messaging/protocol.ts —— Port 名称常量 + 消息类型(以代码为准;路由逻辑在 src/messaging/handler.ts 便于单测)
export type BgRequest =
  | { kind: 'translate-stream'; feature: 'selection'; promptKind: 'selectionDict' | 'selectionText'; vars: PromptVars; bypassCache?: boolean }
  | { kind: 'translate-batch'; feature: 'page'; payload: string; vars: Omit<PromptVars, 'text'> }  // payload = 已编码批次,编解码归 orchestrator
  | { kind: 'list-models'; profileId: string }
  | { kind: 'test-connection'; profileId: string };
export type BgEvent =
  | { type: 'delta'; text: string }
  | { type: 'batch-result'; text: string }
  | { type: 'done'; usage?: ChatResult['usage'] }
  | { type: 'models'; models: string[] }
  | { type: 'test-result'; ok: boolean; latencyMs?: number; errorCode?: LlmErrorCode; message?: string }
  | { type: 'error'; code: LlmErrorCode; message: string };
// 另有 background/popup → content 的一次性消息:
//   ContentMessage = { type: 'open-selection-panel' | 'translate-page' | 'get-page-status' }
//   PageStatusReply = 'idle' | 'translating' | 'done';  TabMessage = { type: 'page-status-changed'; status: PageStatusReply }

// src/selection/classify.ts
export function classifySelection(text: string): 'dict' | 'text';
// src/selection/dict-result.ts
export interface DictResult { word: string; phonetic?: string; senses: { pos?: string; meaning: string }[]; examples?: string[] }
export function parseDictResult(raw: string): DictResult | null;  // null = 降级纯文本

// src/segmenter/index.ts
export interface Segment { id: number; element: Element; text: string }
export function collectSegments(root: ParentNode): Segment[];

// src/translator/batch.ts —— 编号标记协议
export function encodeBatch(items: { id: number; text: string }[]): string;
export function decodeBatch(raw: string): Map<number, string>;   // 容忍缺号/乱序/多余

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

## M0 脚手架(可加载、CI 绿) ✅

| 任务 | 内容 | Files | 验收 | 依赖 | 估 |
|---|---|---|---|---|---|
| **T0.1** 项目初始化 | `pnpm dlx wxt@latest init`(react-ts 模板)后调整:strict tsconfig、`@/` 别名、`src/brand.ts`、四入口空壳(background/content/popup/options) | package.json, wxt.config.ts, tsconfig.json, entrypoints/*, src/brand.ts | `pnpm dev` 后 Chrome 开发者模式可加载,四入口无报错 | — | M |
| **T0.2** Biome | biome.json(recommended + organize imports),scripts:`lint`/`format` | biome.json, package.json | `pnpm lint` 0 error | T0.1 | S |
| **T0.3** vitest | vitest.config.ts(WxtVitest 插件 + fake-browser),一个冒烟测试 | vitest.config.ts, tests/smoke.test.ts | `pnpm test` 绿 | T0.1 | S |
| **T0.4** manifest 与权限 | permissions: `storage`,`contextMenus`;host_permissions `<all_urls>`;content script matches `<all_urls>`;commands 骨架(`translate-selection`/`translate-page`);name 引 BRAND | wxt.config.ts, entrypoints/content.tsx | chrome://extensions 显示权限正确;快捷键出现在 chrome://extensions/shortcuts | T0.1 | S |
| **T0.5** CI | ci.yml:PR/push → pnpm install + typecheck + lint + test + `wxt build`;release.yml 骨架(tag 触发,先只 build) | .github/workflows/ci.yml, release.yml | PR 上 CI 全绿 | T0.2-3 | S |

## M1 协议层与 Provider 管理(options 真实连通两协议) ✅

| 任务 | 内容 | Files | 验收 | 依赖 | 估 |
|---|---|---|---|---|---|
| **T1.1** 类型层 | 契约中 `src/llm/types.ts` 全量类型 + `LlmError` | src/llm/types.ts | typecheck 过;LlmError 可 instanceof | T0 | S |
| **T1.2** SSE 解析器 | `parseSse`:按行组装事件;覆盖半包分割、一包多事件、CRLF、`event:` 行、`[DONE]` 不特殊处理(交给 adapter) | src/llm/sse.ts, tests/llm/sse.test.ts | 单测:≥8 个分包边界 case 绿 | T1.1 | M |
| **T1.3** Base URL 规范化 | `normalizeBaseUrl`/`endpointFor`;规则:去尾 `/`;openai 无 path 补 `/v1`,chat=`{base}/chat/completions`,models=`{base}/models`;anthropic chat=`{base}/v1/messages`(base 已含 `/v1` 则不重复),models 同理 | src/llm/base-url.ts, tests/llm/base-url.test.ts | 单测:官方/网关/带路径/带尾斜杠矩阵绿 | T1.1 | S |
| **T1.4** OpenAI adapter | 请求构造(Bearer、messages 首条 system、`stream:true`)、`choices[0].delta.content` 增量、`[DONE]` 结束、非流 `complete`、HTTP→LlmError 映射 | src/llm/openai.ts, tests/llm/openai.test.ts | mock fetch 单测:流/非流/401/404/429/500/超时/中断 | T1.2-3 | M |
| **T1.5** Anthropic adapter | 头:`x-api-key`+`anthropic-version: 2023-06-01`+`anthropic-dangerous-direct-browser-access: true`;顶层 `system`;`max_tokens` 必填(默认 4096 或 params.maxTokens);`content_block_delta`/`text_delta` 增量,`message_stop` 结束 | src/llm/anthropic.ts, tests/llm/anthropic.test.ts | 同 T1.4 的用例矩阵绿 | T1.2-3 | M |
| **T1.6** 客户端工厂 | `createClient` 按 protocol 分发;共享重试(429 读 retry-after、5xx,≤2 次指数退避);`testConnection`(1 token 请求测延迟);`listModels`(失败返回 `[]` 不抛) | src/llm/client.ts, tests/llm/client.test.ts | 单测:重试次数/退避/两协议分发 | T1.4-5 | M |
| **T1.7** 存储层 | schema 默认值、`getSettings/updateSettings/watchSettings/resolveProfile`(覆盖→全局回退)、version 迁移骨架、导入导出(includeKeys 开关、导入校验) | src/storage/*, tests/storage/*.test.ts | fake-browser 单测:读写/回退/导出脱敏/导入非法 JSON 报错 | T1.1 | M |
| **T1.8** Prompt 层 | 三套内置模板(词典 JSON 输出/划词译文/全文批量编号协议)+ `renderPrompt` 插值 + overrides 生效 + version 常量 | src/prompts/*, tests/prompts/*.test.ts | 单测:插值/覆盖/未知变量保留原样 | T1.1 | S |
| **T1.9** background 路由 | `src/messaging/protocol.ts` + background:onConnect 处理 4 类 BgRequest,translate-stream 经 `resolveProfile`+`renderPrompt`+`createClient.stream` 把 delta 转发为 BgEvent;AbortController 绑定 port disconnect | src/messaging/protocol.ts, entrypoints/background.ts, tests/messaging/protocol.test.ts | 协议编解码单测绿;手动:options 控制台经 port 收到 delta | T1.6-8 | M |
| **T1.10** Provider CRUD UI | options 页:Provider 列表/新增/编辑(协议、baseUrl、key 掩码、模型输入)/删除(默认项保护)/设全局默认/划词与全文覆盖下拉 | entrypoints/options/*, src/ui/* | 手动清单:CRUD 全通;刷新持久 | T1.7 | L |
| **T1.11** 连通验证 | 「测试连接」「拉取模型」按钮走 background;错误按 LlmErrorCode 显示可读文案 | entrypoints/options/*, entrypoints/background.ts | 真实 OpenAI 兼容 + Anthropic 兼容端点各连通一次(冒烟记录) | T1.9-10 | S |

## M2 划词翻译(任意站点可用) ✅

| 任务 | 内容 | Files | 验收 | 依赖 | 估 |
|---|---|---|---|---|---|
| **T2.1** 选区判定 | `classifySelection`:≤3 词且无句末标点→`dict`(CJK 按字符数阈值);2000 字符上限校验独立导出 | src/selection/classify.ts, tests/selection/classify.test.ts | 中/英/混合 fixtures 单测绿 | — | S |
| **T2.2** 划词图标 | content:`selectionchange`+`mouseup` 防抖;选区尾部定位小图标(`createShadowRootUi`);排除 input/textarea/contenteditable、密码域;`disableSelection` 站点不挂载;`instant`/`shortcut-only` 模式分支 | entrypoints/content.tsx, src/ui/SelectionIcon.tsx | 手动清单:Google/GitHub/知乎三站图标正常、输入框不出 | T1.7 | M |
| **T2.3** 浮层面板 | 浮层组件:定位(视口边缘翻转)、加载骨架、Esc/外点关闭、pin、复制、重试、目标语言临时切换 | src/ui/TranslatePanel.tsx | 手动清单逐项过 | T2.2 | M |
| **T2.4** 流式接线 | content 侧 port client(`useTranslateStream` hook):发 translate-stream、增量渲染 delta、error 态、断线重连一次 | src/ui/useTranslateStream.ts | 手动:真实 API 流式出字;断网出错误态 | T1.9, T2.3 | M |
| **T2.5** 词典卡片 | `parseDictResult`(容忍 markdown 代码围栏)+ 词典卡片组件(音标/词性/义项/例句);解析失败降级纯文本;卡片内手动切换 词典⇄译文 | src/selection/dict-result.ts, src/ui/DictCard.tsx, tests/selection/dict-result.test.ts | 单测:标准 JSON/围栏包裹/坏 JSON→null;手动:单词出词典卡 | T2.4 | M |
| **T2.6** 快捷键 | `translate-selection` command → background 转发当前 tab;`shortcut-only`/`instant` 模式接线 | entrypoints/background.ts, entrypoints/content.tsx | 手动:三种触发模式行为符合设置 | T2.4 | S |
| **T2.7** 划词设置 | options:触发方式单选、目标语言选择、禁用站点清单编辑(增删域名) | entrypoints/options/* | 手动:改设置即时生效(watchSettings) | T2.2 | S |

## M3 全文翻译(新闻/文档/SPA 三类站点可用) ✅

| 任务 | 内容 | Files | 验收 | 依赖 | 估 |
|---|---|---|---|---|---|
| **T3.1** 分块器 | `collectSegments`:遍历 `p/li/h1-h6/td/blockquote/dd/figcaption` 等;短块合并(<20 字符并入相邻)、超长拆分(>1000 字符按句);跳过 code/pre/script/style/textarea/contenteditable/纯链接/纯数字;可见性过滤 | src/segmenter/index.ts, tests/segmenter/*.test.ts + fixtures/*.html | 新闻页/表格/代码文档/嵌套列表 4 组 fixture 单测绿 | — | L |
| **T3.2** 批量协议 | `encodeBatch`(`@@n@@` 行标记)+ `decodeBatch`(缺号跳过、乱序容忍、多余丢弃) | src/translator/batch.ts, tests/translator/batch.test.ts | 单测:正常/缺号/乱序/粘连 case 绿 | — | S |
| **T3.3** 编排器 | `translateSegments`:按 token 预算组包(估算 len/2,≤1500 输出)、并发池(默认 3)、失败批次重试 1 次、`chrome.i18n.detectLanguage` 跳过同目标语言块、AbortController 全局取消 | src/translator/orchestrator.ts, tests/translator/orchestrator.test.ts | 单测(mock client):组包/并发上限/取消/跳过 | T3.1-2, T1.6 | L |
| **T3.4** 缓存 | 见下方「缓存设计」;background 集中缓存 + 浮层内记忆,按内容 key、LRU 淘汰,`cacheKey` 含 mode/promptVersion,Retry 绕过 | src/translator/cache.ts, tests/translator/cache.test.ts | 单测:命中/淘汰/清空;手动:切 dict/text 与刷新页面秒回 | T1.7 | M |
| **T3.5** DOM 注入 | 双语对照:原块后插 `data-llmt` 标记节点(textContent);仅译文:隐藏原块;`restorePage()` 全还原;模式热切换 | entrypoints/content.tsx, src/ui/inject.ts, tests/ui/inject.test.ts(happy-dom) | 单测:注入/还原幂等;手动:两模式切换无残留 | T3.1 | M |
| **T3.6** 懒翻译 | IntersectionObserver:视口 ±1 屏优先入队,滚动追加;与编排器队列衔接 | entrypoints/content.tsx | 手动:长页首屏先出,滚动补翻 | T3.3, T3.5 | M |
| **T3.7** 动态内容 | MutationObserver 增量收块进队;SPA URL 变化(history hook)重置翻译态 | entrypoints/content.tsx | 手动:Twitter/官方文档 SPA 切页正常 | T3.6 | M |
| **T3.8** 页内工具条 | 浮动工具条:进度 n/N、暂停/继续、取消、双语⇄仅译文、还原、关闭 | src/ui/PageToolbar.tsx | 手动清单逐项过 | T3.6 | M |
| **T3.9** popup | 翻译此页(触发/还原态切换)、模式选择、本站自动翻译开关、当前生效 Provider 展示、跳设置 | entrypoints/popup/* | 手动清单逐项过 | T3.5 | M |
| **T3.10** 触发收口 | 右键菜单(翻译此页/翻译所选)、`translate-page` 快捷键、autoTranslate 站点加载即翻 | entrypoints/background.ts, entrypoints/content.tsx | 手动:四种触发路径全通 | T3.8-9 | S |

## M4 设置完善 ✅

| 任务 | 内容 | Files | 验收 | 依赖 | 估 |
|---|---|---|---|---|---|
| **T4.1** Prompt 编辑器 | 三套模板 textarea、变量说明、实时预览(renderPrompt)、恢复默认 | entrypoints/options/* | 手动:覆盖生效且缓存 key 变化(version) | T1.8 | M |
| **T4.2** 导入导出 UI | 导出下载 JSON(默认不含 Key,勾选含 Key+敏感提示);导入文件校验+确认覆盖 | entrypoints/options/* | 手动:往返导入导出等价;脱敏正确 | T1.7 | S |
| **T4.3** i18n | WXT i18n 模块;zh_CN + en 两套 messages;UI 文案全部走 i18n key | public/_locales/*, 全 UI 文件 | 切换浏览器语言 UI 跟随;无硬编码文案(grep 检查) | M2-3 | M |
| **T4.4** 杂项收尾 | 缓存用量显示/一键清空;快捷键说明+跳转 `chrome://extensions/shortcuts`(MV3 不可编程修改);「选中即翻」防抖参数与费用提示文案 | entrypoints/options/* | 手动清单逐项过 | T3.4 | S |

## M5 质量与上架 ✅(除商店实际提交)

> 状态:T5.1/T5.2 E2E(Playwright 加载扩展 + mock LLM + 划词/全文冒烟 + CI e2e job)✅;
> T5.3 品牌定稿(LLM Translate)+ 图标(见 `assets/logo/`)+ 商店截图(`pnpm screenshots` → `store-assets/screenshots/`)+ 中英 listing(`store-assets/listing.*.md`)✅;
> T5.4 隐私政策(`docs/privacy-policy.md`)+ 权限 justification(`store-assets/justifications.md`)✅;
> T5.5 release.yml(tag→build→zip→GH Release)✅、版本 0.1.0 ✅。**唯一待办:CWS + Edge 首次人工提交(需维护者账号)。**

| 任务 | 内容 | Files | 验收 | 依赖 | 估 |
|---|---|---|---|---|---|
| **T5.1** E2E 脚手架 | Playwright chromium `--load-extension` 加载 `wxt build` 产物;`e2e/mock-llm.ts` 本地 server(两协议、可 SSE);用例1:配 Provider→划词→浮层出译文 | e2e/*, playwright.config.ts | 本地 `pnpm e2e` 绿 | M2 | L |
| **T5.2** E2E 全文 + CI | 用例2:fixture 页全文翻译→双语注入→还原;CI 加 e2e job | e2e/page.spec.ts, ci.yml | CI 含 E2E 全绿 | T5.1, M3 | M |
| **T5.3** 品牌与素材 | 品牌名定稿(改 `src/brand.ts` 一处)、图标全尺寸(16-128)、商店截图、zh/en listing 文案 | src/brand.ts, public/icon/*, store-assets/* | 素材齐全过一遍商店规格 | M4 | M |
| **T5.4** 合规文档 | 隐私政策页(GitHub Pages 或 static)、`<all_urls>`/host_permissions/storage/contextMenus 用途 justification 文案 | docs/privacy-policy.md, store-assets/justifications.md | 对照 CWS 政策自查通过 | T5.3 | S |
| **T5.5** 发布 | release.yml 完成(tag→build→`wxt zip`→GH Release 附产物);CWS + Edge Add-ons 首次人工提交 | .github/workflows/release.yml | 双商店提交成功进入审核 | T5.2-4 | M |

## 里程碑后增强(用户反馈驱动,post-M5)

- **全文失败重试**:批次失败的块标 `⚠`,可**逐块点击重试**,或用工具条**「重试 N 项失败」一键重试**;保留已成功译文,重试时后台重读设置(改好 key/URL 即生效)。相关:`src/translator/inject.ts`(countErrored / collectErroredElements / erroredSourceOf)、`src/ui/page/store.ts`(retryFailed + 委托点击)。
- **划词浮层可拖拽 + 智能定位**:浮层可从标题栏拖走避让正文;按上下可用空间择优弹出,body 高度按可用空间封顶不溢出屏幕。共享拖拽 hook `src/ui/useDrag.ts`(工具条与浮层共用);定位纯函数 `src/ui/selection/panel-position.ts`(含单测)。

## 依赖关系与并行机会

```
M0 → M1(T1.1 → {T1.2,T1.3} → {T1.4,T1.5} → T1.6 → T1.9 → T1.11;T1.7/T1.8 可并行;T1.10 依赖 T1.7)
M1 → M2(T2.1 可提前并行)
M1 → M3(T3.1/T3.2 纯逻辑可与 M2 并行;T3.3 起依赖 T1.6)
M2+M3 → M4 → M5(T5.1 只依赖 M2,可提前)
```

**估算汇总**:S=≤0.5 天,M=1 天,L=1.5-2 天;合计约 **35-40 人天**。

## 缓存设计(2026-07-07 与产品负责人讨论确认)

翻译结果对固定输入是稳定的,**按内容做 key、按容量淘汰(LRU),不按时间过期**;"强制刷新"由 Retry 承担(绕过缓存)。分两层:

- **第一层 · 浮层内记忆**(随 M2 划词做,零存储):浮层把 dict / text 两种模式的结果留在组件 state,切换模式或来回查看**瞬时命中、零请求**;切换目标语言才失效。直接消除"切换即重发"的体验问题。
- **第二层 · background 集中缓存**(T3.4):所有请求走单一出口,在 background 按 `hash(protocol + model + promptVersion + targetLang + mode + 原文)` 缓存。命中则把完整结果当一个 delta + done 发回(不改消息协议、不调 API);未命中则流式并在结束后写入。
  - 存储介质:划词用 **`chrome.storage.session`**(内存、关浏览器自动清、不落盘,隐私最好);全文翻译用 **`storage.local`**(跨会话持久,体量大)。
  - 容量:LRU 上限(≈5MB 或 N 条),配 T4.4 的用量显示 + 一键清空。
- **明确不引入 Redis / 任何服务端缓存**:违背无后端(ADR-0001)与数据只在本机(ADR-0002)的核心定位;客户端存储已免费覆盖需求。

## 里程碑验收(来自 docs/plan.md §11)

- M0:dev 模式加载运行,CI 绿
- M1:单测绿;设置页真实连通两协议
- M2:任意站点划词可用(三站手动清单)
- M3:新闻站/文档站/SPA 三类站点全文翻译可用
- M4:全量设置可用,i18n 无硬编码
- M5:双商店过审

## 风险与预研标记

- **MV3 SW 休眠**:超长流式任务中 SW 被杀 → Port 消息与进行中 fetch 可保活,T1.9 实现时验证 5 分钟长流;若不足加 port 心跳。
- **decodeBatch 对弱模型的容错**(T3.2):标记协议在小模型上可能格式漂移,单测覆盖粘连/缺号,必要时 M3 中切 JSON 数组输出做 A/B。
- **CWS 审核周期**(T5.5):`<all_urls>` 扩展审核可能 1-3 周,提前准备 justification(T5.4)。
