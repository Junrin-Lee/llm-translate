# 方案计划 — LLM 翻译浏览器扩展

[English](./plan.md) · **简体中文**

> 状态:已与产品负责人对齐(2026-07-06)。术语见根目录 [CONTEXT.md](../CONTEXT.zh-CN.md),关键取舍见 [docs/adr/](./adr/)。

## 1. 产品定义

对标 Trancy 的精简版:只做**划词翻译**与**全文翻译**两个功能,翻译能力完全由用户自带的 LLM API 提供(BYOK,无自建后端、无账号体系)。

**明确不做**:账号绑定、视频/字幕翻译、生词本、PDF 翻译、划词以外的 AI 动作(润色/总结等)。

## 2. 已对齐决策

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 发布目标 | 上架 Chrome Web Store + Edge Add-ons(同一份 MV3 产物)+ Firefox Add-ons/AMO(独立 MV3 产物,ADR-0005) |
| 2 | 技术栈 | WXT + React + TypeScript,pnpm |
| 3 | Provider 模型 | 多 Provider 配置;全局默认 + 划词/全文各自可功能级覆盖 |
| 4 | 划词触发 | 默认「选中出图标、点击翻译」;支持快捷键直翻;设置可切换为选中即翻/仅快捷键 |
| 5 | 划词内容 | 单词/短语 → 词典卡片(音标/词性/多义/例句);句子/段落 → 译文卡片;均流式输出 |
| 6 | 全文模式 | 双语对照为默认,可切「仅译文」(可一键还原) |
| 7 | 全文触发 | 扩展图标 + 快捷键 + 右键菜单 + 自动翻译站点清单 |
| 8 | 权限模型 | content script 常驻 `<all_urls>`(见 ADR-0001) |
| 9 | 数据存储 | 全部仅 `storage.local`,配置支持 JSON 导入/导出(见 ADR-0002) |
| 10 | Prompt | 内置三套默认模板,设置页高级区可覆盖(变量插值),一键恢复默认 |
| 11 | 命名 | 工作名 `llm-translate`,品牌名做常量集中管理,上架前定稿 |
| 12 | 工程实践 | vitest 单测核心逻辑 + Playwright E2E 冒烟 + Biome + GitHub Actions |

## 3. 架构

### 3.1 入口拓扑(WXT entrypoints)

```
entrypoints/
├── background.ts          # Service worker:唯一的 LLM 请求出口、菜单/快捷键注册
├── content.tsx            # 常驻 content script:划词监听 + 浮层 UI + 全文翻译 DOM 引擎
├── popup/                 # 扩展图标弹窗:翻译此页按钮、模式切换、自动翻译站点开关
└── options/               # 设置页:Provider CRUD、触发方式、Prompt 模板、导入导出
```

### 3.2 关键数据流

```
划词: selection → 图标 → content 发起 port 连接 → background 调 LLM(SSE)
      → chunk 经 port 流式回传 → 浮层增量渲染
全文: 触发 → content 分块扫描 DOM → 分批经 port 发给 background → 并发调 LLM
      → 每批结果回传 → content 注入译文节点(双语对照/仅译文)
```

- **所有网络请求只从 background service worker 发出**(配合 `host_permissions` 绕过页面 CORS;content script 永不直连 API)。
- 流式与批量结果统一走 `chrome.runtime.connect` 的 **Port** 通道(顺带为 SW 保活;MV3 SW 空闲 30s 会休眠,活跃 port 消息与进行中的 fetch 可延长生命周期)。
- 状态极简:无全局 store,配置读写经统一 storage 模块,content 内部用 React 局部状态。

### 3.3 模块划分(src/)

```
src/
├── llm/                   # ★ 协议层(纯逻辑,重点单测)
│   ├── types.ts           # TranslationClient 接口、请求/响应/错误归一化类型
│   ├── openai.ts          # OpenAI 兼容 adapter
│   ├── anthropic.ts       # Anthropic 兼容 adapter
│   └── sse.ts             # 通用 SSE 解析器(fetch + ReadableStream)
├── translator/            # 翻译编排:prompt 组装、分批、并发、重试、缓存
├── segmenter/             # ★ 全文 DOM 分块器(纯逻辑,重点单测)
├── selection/             # 划词判定:单词/短语 vs 句子(纯逻辑,重点单测)
├── storage/               # storage.local schema、迁移、导入导出
├── prompts/               # 三套默认模板 + 变量插值
└── ui/                    # 浮层、工具条、popup/options 共享组件
```

## 4. Provider 协议层

统一接口(两个 adapter 各自实现):

```ts
interface TranslationClient {
  stream(req: ChatRequest, onDelta: (text) => void, signal: AbortSignal): Promise<ChatResult>
  complete(req: ChatRequest, signal: AbortSignal): Promise<ChatResult>
  listModels(): Promise<string[]>        // 失败不阻塞,允许手动输入模型名
  testConnection(): Promise<TestResult>  // 设置页「测试」按钮
}
```

| | OpenAI 兼容 | Anthropic 兼容 |
|---|---|---|
| 端点 | `{base}/chat/completions` | `{base}/v1/messages` |
| 认证 | `Authorization: Bearer <key>` | `x-api-key: <key>` |
| 必需 header | — | `anthropic-version: 2023-06-01`、`anthropic-dangerous-direct-browser-access: true`(浏览器上下文直连官方 API 必需,对兼容网关无害) |
| 必填参数 | model, messages | model, messages, **max_tokens** |
| system | messages 首条 `role:system` | 顶层 `system` 字段 |
| 流式 | SSE,`choices[0].delta.content`,`[DONE]` 结尾 | SSE,`content_block_delta` 事件的 `text_delta` |
| 模型列表 | `GET {base}/models` | `GET {base}/v1/models` |

- 错误归一化:401/403(凭证)、404(端点或模型)、429(限流,读 `retry-after` 退避重试 ≤2 次)、5xx(重试)、网络错误、超时(默认 60s,可经每个 Provider 的 `params.timeoutMs` 配置——暂无独立 UI 输入项)。错误信息面向用户可读(中英)。
- **不引入官方 SDK**,自研轻量客户端:双协议对称、包体积小、MV3 SW 环境零适配(见 ADR-0003)。
- Base URL 规范化:自动容错末尾 `/`;对**无 path**(裸 origin)的 OpenAI 兼容 base 自动补 `/v1`(已带 path 的 base 原样保留),这是兼容网关场景的高频坑。

## 5. 划词翻译

1. content script 监听 `selectionchange` + `mouseup`,有有效选区(非空白、非输入框内密码域、长度 ≤ 上限 2000 字符)时在选区尾部浮出小图标。
2. 点击图标 / 快捷键 → 打开浮层(`createShadowRootUi` 挂载,Shadow DOM 隔离站点样式)。
3. **形态判定**(`selection/` 纯函数):选区 ≤ 3 个词且无句末标点 → 词典卡片,否则译文卡片;浮层内可手动切换两种形态(判定只是默认值)。
4. 流式渲染;词典卡片要求 LLM 按约定 JSON 输出(音标/词性/义项/例句),解析失败降级为纯文本展示。
5. 浮层交互:复制、重试、切换目标语言(会更新默认目标语言)、拖拽移动浮层、按上下空间智能定位避让正文(点击页面其他区域默认关闭,Escape 关闭)。
6. 站点排除清单:在指定站点禁用划词图标(与自动翻译站点清单同一套站点规则存储)。

## 6. 全文翻译

- **分块**(`segmenter/`):收集叶子 block 级语义单元(`p/li/h1-h6/td/blockquote/dd/figcaption` 等)并规范化文本,每块与一个 DOM 元素 1:1 对应;跳过 `code/pre/script/style/textarea/contenteditable`、隐藏元素、过短(至少含一个字母)/纯链接块。_(短块合并、超长拆分、以及用 `chrome.i18n.detectLanguage` 跳过同目标语言块,当初在此规划过,但未实现。)_
- **视口优先懒翻译**:先翻可视区域及附近,IntersectionObserver 驱动滚动加载;省 token、首屏快。
- **批量请求**:多块合并为一次 LLM 调用(带编号标记协议,响应按编号回填),单请求 ≤ 约 1500 输出 token 预估,并发默认 3(代码常量,不可由用户配置)。
- **注入**:双语对照 = 在原文块后插入带扩展标记 class 的译文节点;仅译文 = 隐藏原文节点(不销毁)。**译文一律以 `textContent` 写入,绝不 `innerHTML`**(LLM 输出视为不可信输入,防 XSS)。一键还原 = 移除所有扩展节点 + 恢复隐藏节点。
- **动态内容**:MutationObserver 监听新增块,页面处于已翻译状态时增量翻译(SPA 路由切换按 URL 变化重置状态)。
- **进度与控制**:可拖拽的页内浮动工具条(进度、取消、模式切换、还原、重试失败块)。
- **缓存**:内存 + `storage.session`(划词)/ `storage.local`(全文)LRU,key = hash(协议+模型+prompt 版本+目标语言+类型+原文);刷新页面重译秒回。
- **自动翻译站点**:域名清单命中时页面加载完成即自动触发。

## 7. 存储 Schema(storage.local,含 version 字段供迁移)

```ts
{
  version: 1,
  providers: ProviderProfile[],            // {id, name, protocol, baseUrl, apiKey, model, params?}
  defaults: { global: id, selection?: id, page?: id },   // 功能级覆盖
  general: { targetLang, secondaryTargetLang?, selectionTrigger, pageMode, uiLang },  // secondaryTargetLang:预留,暂未接入任何 UI;uiLang: 界面语言 auto/en/zh
  siteRules: { autoTranslate: string[], disableSelection: string[] },
  prompts: { selectionDict?, selectionText?, pageBatch? },  // 未设置 = 用内置默认
}
```

> 翻译缓存**不在** `AppSettings` 内,而是独立的存储键(划词用 `storage.session`、全文用 `storage.local`),按内容 key、LRU 淘汰、可一键清空;详见 roadmap「缓存设计」。

导入/导出:JSON 文件;导出默认**不含** API Key,勾选「包含 Key」才导出并给敏感提示。导入时 `id` / `baseUrl` / `model` 必填;`name` 可选(允许为空,因为配置按 id 绑定)。

## 8. Prompt 层

三套内置模板:`划词-词典`(JSON 输出)、`划词-译文`、`全文-批量`(编号标记协议)。实际使用的变量:`{{text}}` 与 `{{targetLang}}`。模板层还定义了 `{{sourceLang}}` / `{{siteTitle}}`,但调用方尚未赋值,当前恒为空。设置页高级区每套可覆盖、可恢复默认;模板版本号参与缓存 key。

## 9. 权限与商店合规

| manifest 项 | 用途说明(审核 justification 素材) |
|---|---|
| `content_scripts` matches `<all_urls>` | 划词需在任意页面监听选区;全文需改写任意页面 DOM |
| `host_permissions: <all_urls>` | 用户自定义任意 LLM API Base URL,background 需向其发请求 |
| `permissions: storage` | 本机保存配置与翻译缓存 |
| `permissions: contextMenus` | 右键「翻译此页/翻译所选」 |
| `commands` | 快捷键 |

隐私政策要点:所有配置与 Key 仅存本机;唯一网络请求是发往**用户自己配置的** API 端点,内容为待翻译文本;开发者不运营任何服务器、不收集任何数据。界面 i18n:zh-CN + en(商店 listing 双语)。

## 10. 测试与 CI

- **vitest 单测**:`llm/`(两协议请求构造、SSE 解析含分包边界、错误归一化)、`segmenter/`(HTML fixture 分块)、`selection/`(判定)、`prompts/`(插值)、storage 迁移。
- **Playwright E2E 冒烟**:chromium `--load-extension` 加载构建产物,本地 mock LLM server(可返回 SSE);用例:配置 Provider → 划词出浮层出译文;全文翻译双语对照注入与还原。
- **GitHub Actions**:PR = typecheck + Biome + vitest + build + E2E;tag `v*` = 构建 + `wxt zip` 产出 Chrome/Edge 包 + GitHub Release。商店提交首版手动,后续可接自动提交。

## 11. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M0 脚手架 | WXT+React+TS 初始化、Biome、CI、四入口空壳 | dev 模式加载运行 |
| M1 协议层 | `llm/` 双 adapter + SSE + 单测;options 页 Provider CRUD + 测试连接 | 单测绿;设置页真实连通两协议 |
| M2 划词 | 图标/浮层/快捷键、判定、词典+译文卡片流式 | 任意站点划词可用 |
| M3 全文 | 分块、批量、懒翻译、双语/仅译文、还原、动态内容、工具条、缓存 | 新闻站/文档站/SPA 三类站点可用 |
| M4 设置完善 | 站点清单、Prompt 覆盖、导入导出、i18n、快捷键设置 | 全量设置可用 |
| M5 上架 | E2E 补齐、图标素材、隐私政策、双商店提交(品牌名定稿) | 双商店过审 |

## 12. 待定项

- 品牌名与商店标题(M5 前定稿;代码中经 `BRAND` 常量引用)。
- 划词「选中即翻」模式的防抖与费用提示文案(M2 实现时定)。
