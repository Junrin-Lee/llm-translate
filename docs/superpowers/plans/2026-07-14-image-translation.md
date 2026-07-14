# Image Translation(图片翻译)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增第三个翻译功能 Image Translation(图片翻译):用户框选当前页面区域(或粘贴/上传图片),图片直接发给用户自带的 vision LLM,译文以流式卡片输出。

**Architecture:** 双协议 client(OpenAI/Anthropic)扩展为多模态;background 单一 LLM 出口不变,新增 `translate-image` 请求。交互双路径:能注入 content script 的页面走"冻结截图 + 原地框选";受限页面(内置 PDF 阅读器等)自动降级为"截可见区 → 扩展页(workbench)裁剪"。裁剪组件两路共用。规格来源:`docs/adr/0006-image-translation-via-user-vision-model.md` + `CONTEXT.md` 的 Image Translation 词条。

**Tech Stack:** WXT 0.20 (MV3, srcDir=src) · React 19 · TypeScript · Vitest (happy-dom) · Biome

## Global Constraints

- Node >= 20.19.0,包管理器 **pnpm@9.15.9**(Node 20 只能配 pnpm 9.15,勿升级)。
- 验证命令:`pnpm typecheck` / `pnpm lint` / `pnpm test`;提交前跑 `pnpm format`(Biome 会改格式)。
- i18n:`src/i18n/messages.ts` 里 EN 是 source of truth,ZH 必须定义相同 key(类型强制,少 key 会 typecheck 失败);所有 UI 文案必须过 `t()`,禁止硬编码。
- 术语:功能名一律 **Image Translation / 图片翻译**;禁用"截图翻译"(CONTEXT.md Avoid 列表)。
- Commit 规范:conventional commits(`feat:` / `docs:` / `test:`),每个任务至少一次提交,测试与实现同一提交。
- 双平台:Chrome/Edge MV3 + Firefox MV3;manifest 变更后跑 `pnpm verify:firefox`。
- 一期明确不做(ADR-0006):右键图片元素直翻、快捷键、图片翻译缓存、识别原文对照输出。
- 浏览器 API 一律用全局 `browser.*`(WXT 提供),不要 import `chrome`。

## 文件结构总览

```
src/capture/                  # 新目录:截取域
  geometry.ts                 # 纯函数:坐标映射/缩放/拖拽矩形/dataURL 解析(唯一重点单测对象)
  crop.ts                     # canvas 裁剪 + 文件转 ImageAttachment(DOM glue,薄)
  session.ts                  # storage.session 暂存待处理截图(popup/bg → workbench 传图)
  launch.ts                   # 共享启动器:截屏 → 尝试原地框选 → 降级 workbench(Task 12 才建,见下)
src/ui/image/                 # 新目录:图片翻译 UI
  image.css                   # 覆盖层/面板样式(content shadow root 与 workbench 共用)
  CropOverlay.tsx             # 拖拽框选组件(双宿主共用)
  ImageResultPanel.tsx        # 流式译文卡片(双宿主共用)
  ImageCaptureApp.tsx         # content script 内的编排器
src/entrypoints/image-translate/  # 新 entrypoint:降级路径 workbench 页
  index.html / main.tsx / App.tsx / style.css
```

修改的既有文件:`src/llm/types.ts`、`src/llm/openai.ts`、`src/llm/anthropic.ts`、`src/prompts/templates.ts`、`src/storage/schema.ts`、`src/storage/index.ts`、`src/messaging/protocol.ts`、`src/messaging/handler.ts`、`src/entrypoints/content.tsx`、`src/entrypoints/background.ts`、`src/entrypoints/popup/App.tsx`、`src/entrypoints/options/DefaultsPanel.tsx`、`src/entrypoints/options/PromptsPanel.tsx`、`src/i18n/messages.ts`、`wxt.config.ts`。

**任务依赖**:T1/T2/T3/T4 相互独立 → T5 依赖 T1-T4;T6 独立 → T7 依赖 T6;T8/T9 依赖 T6/T7/T5;T10 依赖 T8+T9;T11 依赖 T8+T9+T10(storage 提示 helpers);T12 依赖 T10+T11;T13 依赖 T3+T4;T14 收尾。

---

### Task 0: 提交方案对齐文档

分支 `feat/image-translation` 上已有未提交的对齐产物(grill 会话生成),先落地成第一个 commit。

- [ ] **Step 1: 确认并提交**

```bash
git add CONTEXT.md CONTEXT.zh-CN.md docs/adr/0006-image-translation-via-user-vision-model.md docs/adr/0006-image-translation-via-user-vision-model.zh-CN.md
git commit -m "docs: introduce Image Translation vocabulary and ADR-0006"
```

注意:`.codegraph/` 是本地索引,**不要** add(保持 untracked)。

---

### Task 1: 多模态 ChatRequest + OpenAI adapter

**Files:**
- Modify: `src/llm/types.ts`
- Modify: `src/llm/openai.ts`
- Test: `tests/llm/openai.test.ts`

**Interfaces:**
- Consumes: 无(起点任务)
- Produces: `ImageAttachment { mediaType: string; dataBase64: string }`、`ChatRequest.images?: ImageAttachment[]`(后续所有任务引用 `@/llm/types`)

- [ ] **Step 1: 写失败测试**

在 `tests/llm/openai.test.ts` 的 `describe('createOpenAiClient.stream')` 内追加(测试助手 `recordingFetch`/`sseResponse`/`bodyOf` 已在 `tests/helpers.ts`,顶部已 import):

```ts
  it('sends image content parts when the request carries images', async () => {
    const fetchImpl = recordingFetch(() => sseResponse(['data: [DONE]\n\n']));
    const client = createOpenAiClient(profile, { fetchImpl });
    await client.stream(
      { ...req, images: [{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }] },
      () => {},
    );

    const body = bodyOf(fetchImpl.calls[0]);
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYS' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
          { type: 'text', text: 'hi' },
        ],
      },
    ]);
  });

  it('keeps user content a plain string when there are no images', async () => {
    const fetchImpl = recordingFetch(() => sseResponse(['data: [DONE]\n\n']));
    const client = createOpenAiClient(profile, { fetchImpl });
    await client.stream({ ...req, images: [] }, () => {});
    expect(bodyOf(fetchImpl.calls[0]).messages[1]).toEqual({ role: 'user', content: 'hi' });
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/llm/openai.test.ts`
Expected: FAIL —— `images` 不在 `ChatRequest` 类型上(编译错)或 content 仍为 string(断言失败)。

- [ ] **Step 3: 实现**

`src/llm/types.ts` — 在 `ChatRequest` 上方新增类型,并给 `ChatRequest` 加字段:

```ts
/** One inline image sent with a chat request (already cropped & downscaled). */
export interface ImageAttachment {
  /** e.g. 'image/jpeg' | 'image/png' | 'image/webp' */
  mediaType: string;
  /** Raw base64 payload WITHOUT the data-URL prefix. */
  dataBase64: string;
}

/** A protocol-agnostic chat request assembled from a rendered prompt. */
export interface ChatRequest {
  system: string;
  user: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** Images the user message carries; both adapters render them as content parts. */
  images?: ImageAttachment[];
}
```

`src/llm/openai.ts` — 替换 `OpenAiBody` 与 `buildBody` 的 user 消息构造:

```ts
type OpenAiUserContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

interface OpenAiBody {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: OpenAiUserContent }>;
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
}
```

`buildBody` 内,把 `messages.push({ role: 'user', content: req.user });` 替换为:

```ts
    const userContent: OpenAiUserContent =
      req.images && req.images.length > 0
        ? [
            ...req.images.map((img) => ({
              type: 'image_url' as const,
              image_url: { url: `data:${img.mediaType};base64,${img.dataBase64}` },
            })),
            { type: 'text' as const, text: req.user },
          ]
        : req.user;
    messages.push({ role: 'user', content: userContent });
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/llm/openai.test.ts && pnpm typecheck`
Expected: PASS(全部既有用例不回归)。

- [ ] **Step 5: 提交**

```bash
pnpm format && git add src/llm/types.ts src/llm/openai.ts tests/llm/openai.test.ts
git commit -m "feat(llm): multimodal ChatRequest with OpenAI image_url content parts"
```

---

### Task 2: Anthropic adapter 多模态

**Files:**
- Modify: `src/llm/anthropic.ts`
- Test: `tests/llm/anthropic.test.ts`

**Interfaces:**
- Consumes: `ImageAttachment`(T1)
- Produces: Anthropic 侧 image source block 渲染(handler 无感知)

- [ ] **Step 1: 写失败测试**

在 `tests/llm/anthropic.test.ts` 的 stream describe 内追加(该文件已有等价的 `profile`/`req`/helpers,Anthropic 流事件格式参照文件内既有用例):

```ts
  it('sends image source blocks when the request carries images', async () => {
    const fetchImpl = recordingFetch(() =>
      sseResponse(['data: {"type":"message_stop"}\n\n']),
    );
    const client = createAnthropicClient(profile, { fetchImpl });
    await client.stream(
      { ...req, images: [{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }] },
      () => {},
    );

    const body = bodyOf(fetchImpl.calls[0]);
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' },
          },
          { type: 'text', text: 'hi' },
        ],
      },
    ]);
  });
```

注意:若该文件的 `req` 常量 user 不是 `'hi'`,以文件内实际值为准调整断言。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/llm/anthropic.test.ts`
Expected: FAIL(content 仍为 string)。

- [ ] **Step 3: 实现**

`src/llm/anthropic.ts` — 替换 `AnthropicBody` 与 `buildBody`:

```ts
type AnthropicUserContent =
  | string
  | Array<
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'text'; text: string }
    >;

interface AnthropicBody {
  model: string;
  messages: Array<{ role: 'user'; content: AnthropicUserContent }>;
  max_tokens: number;
  stream: boolean;
  system?: string;
  temperature?: number;
}
```

`buildBody` 内把 `messages: [{ role: 'user', content: req.user }]` 替换为:

```ts
    const userContent: AnthropicUserContent =
      req.images && req.images.length > 0
        ? [
            ...req.images.map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: img.mediaType,
                data: img.dataBase64,
              },
            })),
            { type: 'text' as const, text: req.user },
          ]
        : req.user;
    const body: AnthropicBody = {
      model: req.model,
      messages: [{ role: 'user', content: userContent }],
      max_tokens: req.maxTokens ?? profile.params?.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream,
    };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/llm/anthropic.test.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
pnpm format && git add src/llm/anthropic.ts tests/llm/anthropic.test.ts
git commit -m "feat(llm): Anthropic image source blocks for multimodal requests"
```

---

### Task 3: `imageText` prompt kind

**Files:**
- Modify: `src/prompts/templates.ts`
- Modify: `src/storage/schema.ts`(仅 `PromptOverrides`)
- Test: `tests/prompts/prompts.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `PromptKind` 增 `'imageText'`;`PromptOverrides.imageText?: string`(T5 handler、T13 PromptsPanel 使用)

- [ ] **Step 1: 写失败测试**

在 `tests/prompts/prompts.test.ts` 追加:

```ts
describe('renderPrompt imageText', () => {
  it('interpolates targetLang into both system and user templates', () => {
    const rendered = renderPrompt('imageText', { text: '', targetLang: 'zh-CN' });
    expect(rendered.system).toContain('zh-CN');
    expect(rendered.user).toContain('zh-CN');
    expect(rendered.version).toBe('v1');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/prompts/prompts.test.ts`
Expected: FAIL —— `'imageText'` 不满足 `PromptKind` 类型。

- [ ] **Step 3: 实现**

`src/prompts/templates.ts`:

```ts
export type PromptKind = 'selectionDict' | 'selectionText' | 'pageBatch' | 'imageText';
```

`DEFAULT_TEMPLATES` 追加(纯译文输出,ADR-0006 决策——不转写原文):

```ts
  imageText: {
    system:
      'You are a precise translator. The user message contains an image. Translate all legible ' +
      'text in the image into {{targetLang}}, following the natural reading order, keeping line ' +
      'breaks between separate blocks. Output only the translation — do not transcribe the ' +
      'source text, do not add commentary.',
    user: 'Translate the text in this image into {{targetLang}}.',
  },
```

`src/storage/schema.ts` 的 `PromptOverrides` 追加一行:

```ts
export interface PromptOverrides {
  selectionDict?: string;
  selectionText?: string;
  pageBatch?: string;
  imageText?: string;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/prompts/prompts.test.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
pnpm format && git add src/prompts/templates.ts src/storage/schema.ts tests/prompts/prompts.test.ts
git commit -m "feat(prompts): imageText prompt kind for Image Translation"
```

---

### Task 4: 路由 —— `ProfileDefaults.image` + `resolveProfile('image')`

**Files:**
- Modify: `src/storage/schema.ts`
- Modify: `src/storage/index.ts`
- Modify: `src/messaging/handler.ts`(仅 `HandlerDeps` 类型)
- Test: `tests/storage/schema.test.ts`(新建)

**Interfaces:**
- Consumes: 无
- Produces: `TranslateFeature = 'selection' | 'page' | 'image'`(定义在 schema.ts);纯函数 `resolveProfileFrom(settings: AppSettings, feature: TranslateFeature): ProviderProfile | null`;`ProfileDefaults.image?: string`。`storage/index.ts` 的 `resolveProfile(feature: TranslateFeature)` 委托给纯函数(background 现有调用不变)。

设计说明:现有 `resolveProfile` 直接读 wxt storage,不可单测;把解析逻辑抽成 schema.ts 里的纯函数,顺带补上三个 feature 的回落测试。

- [ ] **Step 1: 写失败测试**

新建 `tests/storage/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ProviderProfile } from '@/llm/types';
import { type AppSettings, DEFAULT_SETTINGS, resolveProfileFrom } from '@/storage/schema';

const p = (id: string): ProviderProfile => ({
  id,
  name: id,
  protocol: 'openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk',
  model: 'gpt-4o-mini',
});

function settings(overrides: Partial<AppSettings['defaults']>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    providers: [p('g'), p('i')],
    defaults: { global: 'g', ...overrides },
  };
}

describe('resolveProfileFrom', () => {
  it('prefers the image feature override over the global default', () => {
    expect(resolveProfileFrom(settings({ image: 'i' }), 'image')?.id).toBe('i');
  });

  it('falls back to the global default when the feature has no override', () => {
    expect(resolveProfileFrom(settings({}), 'image')?.id).toBe('g');
  });

  it('skips an override id that no longer exists', () => {
    expect(resolveProfileFrom(settings({ image: 'gone' }), 'image')?.id).toBe('g');
  });

  it('returns null when nothing resolves', () => {
    expect(resolveProfileFrom(DEFAULT_SETTINGS, 'selection')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/storage/schema.test.ts`
Expected: FAIL —— `resolveProfileFrom` 未导出。

- [ ] **Step 3: 实现**

`src/storage/schema.ts` —— `ProfileDefaults` 加字段、新增类型与纯函数:

```ts
/** Features that route to a Provider Profile. */
export type TranslateFeature = 'selection' | 'page' | 'image';

/** Which saved profile each feature resolves to; features fall back to global. */
export interface ProfileDefaults {
  global: string | null;
  selection?: string;
  page?: string;
  image?: string;
}

/**
 * Pure resolution: the feature override if present and still valid, otherwise
 * the global default. storage/index.ts wraps this with live settings.
 */
export function resolveProfileFrom(
  settings: AppSettings,
  feature: TranslateFeature,
): ProviderProfile | null {
  const override = settings.defaults[feature];
  for (const id of [override, settings.defaults.global]) {
    if (!id) continue;
    const found = settings.providers.find((profile) => profile.id === id);
    if (found) return found;
  }
  return null;
}
```

注意:`settings.defaults[feature]` 能编译通过是因为三个 feature 名与 `ProfileDefaults` 可选键同名。

`src/storage/index.ts` —— 替换 `resolveProfile` 为委托,并更新 import:

```ts
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  resolveProfileFrom,
  type TranslateFeature,
} from './schema';

/**
 * Resolve the profile a feature should use: its feature override if present and
 * still valid, otherwise the global default. Returns null when neither resolves.
 */
export async function resolveProfile(feature: TranslateFeature): Promise<ProviderProfile | null> {
  return resolveProfileFrom(await getSettings(), feature);
}
```

`src/messaging/handler.ts` —— `HandlerDeps.resolveProfile` 改签名:

```ts
import type { TranslateFeature } from '@/storage/schema';
// ...
  resolveProfile: (feature: TranslateFeature) => Promise<ProviderProfile | null>;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test && pnpm typecheck`
Expected: 全量 PASS(background.ts 对 `resolveProfile` 的传参兼容)。

- [ ] **Step 5: 提交**

```bash
pnpm format && git add src/storage/schema.ts src/storage/index.ts src/messaging/handler.ts tests/storage/schema.test.ts
git commit -m "feat(storage): image feature routing via pure resolveProfileFrom"
```

---

### Task 5: 协议 + handler `translate-image`

**Files:**
- Modify: `src/messaging/protocol.ts`
- Modify: `src/messaging/handler.ts`
- Test: `tests/messaging/handler.test.ts`

**Interfaces:**
- Consumes: `ImageAttachment`(T1)、`'imageText'`(T3)、`TranslateFeature`(T4)
- Produces:
  - `BgRequest` 增 `{ kind: 'translate-image'; feature: 'image'; image: ImageAttachment; vars: Omit<PromptVars, 'text'> }`(T9 面板发送)
  - `ContentMessage` 增 `{ type: 'open-image-capture'; imageDataUrl: string }`(T10 监听、T12 发送)
  - `TabMessage` 变为联合,增 `{ type: 'open-options' }`(T10 发送、T12 background 处理)

- [ ] **Step 1: 写失败测试**

在 `tests/messaging/handler.test.ts` 追加(文件既有 `profile`/`fakeClient`/`collector`/`settingsWith`):

```ts
describe('handleRequest translate-image', () => {
  const imageReq: BgRequest = {
    kind: 'translate-image',
    feature: 'image',
    image: { mediaType: 'image/jpeg', dataBase64: 'AAAA' },
    vars: { targetLang: 'zh-CN' },
  };

  it('resolves the image feature and streams with the image attached', async () => {
    const seen: Array<Parameters<TranslationClient['stream']>[0]> = [];
    const client = fakeClient({
      stream: async (req, onDelta) => {
        seen.push(req);
        onDelta('你好');
        return { text: '你好' };
      },
    });
    const features: string[] = [];
    const { emit, events } = collector();
    await handleRequest(imageReq, emit, {
      getSettings: async () => settingsWith([profile]),
      resolveProfile: async (feature) => {
        features.push(feature);
        return profile;
      },
      createClient: () => client,
    });

    expect(features).toEqual(['image']);
    expect(seen[0].images).toEqual([{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }]);
    expect(seen[0].system).toContain('zh-CN');
    expect(events).toEqual([
      { type: 'delta', text: '你好' },
      { type: 'done', usage: undefined },
    ]);
  });

  it('never touches the caches (images are uncached by design)', async () => {
    const cache = { get: vi.fn(), set: vi.fn() } as unknown as TranslationCache;
    const { emit } = collector();
    await handleRequest(imageReq, emit, {
      getSettings: async () => settingsWith([profile]),
      resolveProfile: async () => profile,
      createClient: () => fakeClient({ stream: async () => ({ text: 'x' }) }),
      selectionCache: cache,
      pageCache: cache,
    });
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('emits not_found when no provider resolves', async () => {
    const { emit, events } = collector();
    await handleRequest(imageReq, emit, {
      getSettings: async () => DEFAULT_SETTINGS,
      resolveProfile: async () => null,
      createClient: () => fakeClient({}),
    });
    expect(events).toEqual([
      { type: 'error', code: 'not_found', message: 'No provider configured' },
    ]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/messaging/handler.test.ts`
Expected: FAIL —— `translate-image` 不在 `BgRequest` 联合内。

- [ ] **Step 3: 实现**

`src/messaging/protocol.ts`:顶部补 `import type { ImageAttachment, LlmErrorCode, TokenUsage } from '@/llm/types';`,`BgRequest` 联合追加:

```ts
  | {
      kind: 'translate-image';
      feature: 'image';
      /** Cropped & downscaled by the UI before it reaches the background. */
      image: ImageAttachment;
      vars: Omit<PromptVars, 'text'>;
    }
```

`ContentMessage` 与 `TabMessage` 更新:

```ts
/** One-off messages the background / popup send to a tab's content script. */
export type ContentMessage =
  | { type: 'open-selection-panel' }
  | { type: 'translate-page' }
  | { type: 'get-page-status' }
  | {
      /** Start in-place Image Translation over a frozen capture of this tab. */
      type: 'open-image-capture';
      imageDataUrl: string;
    };

/** Content → background notifications. */
export type TabMessage =
  | { type: 'page-status-changed'; status: PageStatusReply }
  | { type: 'open-options' };
```

`src/messaging/handler.ts` 的 switch 里、`translate-batch` case 之后追加:

```ts
      case 'translate-image': {
        const settings = await deps.getSettings();
        const profile = await deps.resolveProfile('image');
        if (!profile) {
          emit({ type: 'error', code: 'not_found', message: 'No provider configured' });
          return;
        }
        // No cache on purpose: captures rarely repeat (ADR-0006).
        const rendered = renderPrompt('imageText', { ...req.vars, text: '' }, settings.prompts);
        const client = deps.createClient(profile);
        const result = await client.stream(
          {
            system: rendered.system,
            user: rendered.user,
            model: profile.model,
            images: [req.image],
          },
          (text) => emit({ type: 'delta', text }),
          signal,
        );
        emit({ type: 'done', usage: result.usage });
        return;
      }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/messaging/handler.test.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
pnpm format && git add src/messaging/protocol.ts src/messaging/handler.ts tests/messaging/handler.test.ts
git commit -m "feat(messaging): translate-image request routed through the background port"
```

---

### Task 6: capture 几何纯函数

**Files:**
- Create: `src/capture/geometry.ts`
- Test: `tests/capture/geometry.test.ts`(新目录)

**Interfaces:**
- Consumes: 无
- Produces(T7/T8/T10/T11 使用):
  - `interface Rect { x: number; y: number; width: number; height: number }`
  - `MIN_REGION_CSS_PX = 8`、`MAX_IMAGE_EDGE = 2000`、`JPEG_QUALITY = 0.92`
  - `normalizeDrag(start: {x;y}, end: {x;y}): Rect`
  - `toImageRect(regionCss: Rect, imageWidth, imageHeight, containerWidth, containerHeight): Rect`
  - `fitWithin(width, height, maxEdge): { width; height }`
  - `parseDataUrl(dataUrl: string): { mediaType: string; dataBase64: string } | null`

- [ ] **Step 1: 写失败测试**

新建 `tests/capture/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  fitWithin,
  normalizeDrag,
  parseDataUrl,
  toImageRect,
} from '@/capture/geometry';

describe('normalizeDrag', () => {
  it('produces a positive rect regardless of drag direction', () => {
    expect(normalizeDrag({ x: 100, y: 80 }, { x: 20, y: 30 })).toEqual({
      x: 20,
      y: 30,
      width: 80,
      height: 50,
    });
  });
});

describe('toImageRect', () => {
  it('scales CSS coordinates up to image pixels (devicePixelRatio 2)', () => {
    // 1280×800 viewport captured at 2560×1600.
    expect(toImageRect({ x: 10, y: 20, width: 100, height: 50 }, 2560, 1600, 1280, 800)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });
  });

  it('clamps the region to the image bounds', () => {
    const rect = toImageRect({ x: 1200, y: 700, width: 200, height: 200 }, 2560, 1600, 1280, 800);
    expect(rect.x + rect.width).toBeLessThanOrEqual(2560);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1600);
  });
});

describe('fitWithin', () => {
  it('returns the size unchanged when under the max edge', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });

  it('downscales proportionally when over the max edge', () => {
    expect(fitWithin(4000, 1000, 2000)).toEqual({ width: 2000, height: 500 });
  });
});

describe('parseDataUrl', () => {
  it('splits media type and base64 payload', () => {
    expect(parseDataUrl('data:image/png;base64,iVBOR')).toEqual({
      mediaType: 'image/png',
      dataBase64: 'iVBOR',
    });
  });

  it('returns null for a non-data URL', () => {
    expect(parseDataUrl('https://example.com/x.png')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/capture/geometry.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

新建 `src/capture/geometry.ts`:

```ts
/** Pure geometry for Image Translation capture & crop. No DOM access here. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Drags smaller than this (CSS px on either edge) are treated as accidental. */
export const MIN_REGION_CSS_PX = 8;
/** Longest output edge sent to the LLM; keeps every provider's per-image limit safe (ADR-0006). */
export const MAX_IMAGE_EDGE = 2000;
export const JPEG_QUALITY = 0.92;

/** Turn two drag endpoints (any direction) into a positive rect. */
export function normalizeDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/**
 * Map a region expressed in container CSS pixels onto the captured image's
 * pixel grid. captureVisibleTab renders at devicePixelRatio, so the scale is
 * derived from the actual sizes rather than trusting window.devicePixelRatio.
 */
export function toImageRect(
  regionCss: Rect,
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
): Rect {
  const scaleX = imageWidth / containerWidth;
  const scaleY = imageHeight / containerHeight;
  const x = Math.max(0, Math.round(regionCss.x * scaleX));
  const y = Math.max(0, Math.round(regionCss.y * scaleY));
  return {
    x,
    y,
    width: Math.min(imageWidth - x, Math.round(regionCss.width * scaleX)),
    height: Math.min(imageHeight - y, Math.round(regionCss.height * scaleY)),
  };
}

/** Proportionally fit a size inside maxEdge (no upscaling). */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Split a data URL into media type + raw base64; null when it isn't one. */
export function parseDataUrl(
  dataUrl: string,
): { mediaType: string; dataBase64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], dataBase64: match[2] };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/capture/geometry.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
pnpm format && git add src/capture/geometry.ts tests/capture/geometry.test.ts
git commit -m "feat(capture): pure geometry for region mapping and downscale"
```

---

### Task 7: canvas 裁剪 + session 暂存(glue,无单测)

**Files:**
- Create: `src/capture/crop.ts`
- Create: `src/capture/session.ts`

**Interfaces:**
- Consumes: `Rect`/`toImageRect`/`fitWithin`/`parseDataUrl`/常量(T6);`ImageAttachment`(T1)
- Produces(T10/T11/T12 使用):
  - `cropToAttachment(sourceDataUrl: string, regionCss: Rect, container: { width: number; height: number }): Promise<ImageAttachment>`
  - `imageFileToAttachment(file: Blob): Promise<ImageAttachment>`
  - `stashPendingCapture(dataUrl: string): Promise<void>` / `takePendingCapture(): Promise<string | null>`

说明:canvas/Image 在 happy-dom 下不可用,几何核心已在 T6 单测;这两个文件保持"薄 glue",由 T14 手工冒烟覆盖。

- [ ] **Step 1: 实现 crop.ts**

```ts
import type { ImageAttachment } from '@/llm/types';
import {
  fitWithin,
  JPEG_QUALITY,
  MAX_IMAGE_EDGE,
  parseDataUrl,
  type Rect,
  toImageRect,
} from './geometry';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

function toAttachment(canvas: HTMLCanvasElement): ImageAttachment {
  const parsed = parseDataUrl(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
  if (!parsed) throw new Error('Canvas produced an unexpected data URL');
  return parsed;
}

function drawRegion(
  img: HTMLImageElement,
  region: Rect,
): HTMLCanvasElement {
  const out = fitWithin(region.width, region.height, MAX_IMAGE_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d context unavailable');
  ctx.drawImage(
    img,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    out.width,
    out.height,
  );
  return canvas;
}

/** Crop a region (container CSS px) out of a captured data URL → JPEG attachment. */
export async function cropToAttachment(
  sourceDataUrl: string,
  regionCss: Rect,
  container: { width: number; height: number },
): Promise<ImageAttachment> {
  const img = await loadImage(sourceDataUrl);
  const region = toImageRect(
    regionCss,
    img.naturalWidth,
    img.naturalHeight,
    container.width,
    container.height,
  );
  return toAttachment(drawRegion(img, region));
}

/** Pasted / uploaded file → attachment, downscaled to MAX_IMAGE_EDGE when needed. */
export async function imageFileToAttachment(file: Blob): Promise<ImageAttachment> {
  if (!file.type.startsWith('image/')) throw new Error('Not an image file');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
  const img = await loadImage(dataUrl);
  return toAttachment(
    drawRegion(img, { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight }),
  );
}
```

- [ ] **Step 2: 实现 session.ts**

```ts
/**
 * Hand-off slot for the workbench fallback: the capture happens in the popup /
 * background (while the target tab is still visible), the workbench page picks
 * it up after it opens. storage.session: in-memory, never hits disk (ADR-0002).
 */
const PENDING_KEY = 'capture:pending';

export async function stashPendingCapture(dataUrl: string): Promise<void> {
  await browser.storage.session.set({ [PENDING_KEY]: dataUrl });
}

export async function takePendingCapture(): Promise<string | null> {
  const got = await browser.storage.session.get(PENDING_KEY);
  const dataUrl = got[PENDING_KEY];
  await browser.storage.session.remove(PENDING_KEY);
  return typeof dataUrl === 'string' && dataUrl.length > 0 ? dataUrl : null;
}
```

- [ ] **Step 3: 校验并提交**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS。

```bash
pnpm format && git add src/capture/crop.ts src/capture/session.ts
git commit -m "feat(capture): canvas crop glue and session hand-off slot"
```

---

### Task 8: CropOverlay 组件 + image.css

**Files:**
- Create: `src/ui/image/CropOverlay.tsx`
- Create: `src/ui/image/image.css`

**Interfaces:**
- Consumes: `normalizeDrag`/`MIN_REGION_CSS_PX`/`Rect`(T6);i18n `t()`
- Produces(T10/T11 使用):`<CropOverlay imageUrl onConfirm(regionCss, container) onCancel showNotice onNoticeDismiss />`,region 坐标相对组件容器(绝对定位铺满最近的 positioned 祖先),宿主负责外层定位(content:fixed 全屏;workbench:包住 `<img>` 的 relative 容器)。
- 新 i18n keys(EN/ZH 各一份):`imageCaptureHint`、`imagePrivacyNotice`、`imagePrivacyGotIt`。

- [ ] **Step 1: 加 i18n key**

`src/i18n/messages.ts` EN 对象追加(放在 `// Permission onboarding` 注释之前,新开 `// Image Translation` 分组):

```ts
  // Image Translation
  imageCaptureHint: 'Drag to select the area to translate · Esc to cancel',
  imagePrivacyNotice: 'The selected area is sent only to the API endpoint you configured.',
  imagePrivacyGotIt: 'Got it',
```

ZH 对象对应位置追加:

```ts
  // 图片翻译
  imageCaptureHint: '拖拽框选要翻译的区域 · Esc 取消',
  imagePrivacyNotice: '框选区域仅会发送至你配置的 API 端点。',
  imagePrivacyGotIt: '知道了',
```

- [ ] **Step 2: 实现组件**

新建 `src/ui/image/CropOverlay.tsx`:

```tsx
import { type PointerEvent as ReactPointerEvent, useEffect, useState } from 'react';
import { MIN_REGION_CSS_PX, normalizeDrag, type Rect } from '@/capture/geometry';
import { useT } from '@/i18n/useI18n';

interface Props {
  /** The frozen capture (or uploaded image) shown behind the drag layer. */
  imageUrl: string;
  /** Region is in this component's own CSS pixel space; container is its size. */
  onConfirm: (regionCss: Rect, container: { width: number; height: number }) => void;
  onCancel: () => void;
  /** One-time privacy notice (ADR-0006); host decides via the stored flag. */
  showNotice: boolean;
  onNoticeDismiss: () => void;
}

type Drag = { start: { x: number; y: number }; end: { x: number; y: number } };

export function CropOverlay({ imageUrl, onConfirm, onCancel, showNotice, onNoticeDismiss }: Props) {
  const t = useT();
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const local = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    setDrag({ start: p, end: p });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag) setDrag({ ...drag, end: local(e) });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const box = e.currentTarget.getBoundingClientRect();
    const region = normalizeDrag(drag.start, drag.end);
    setDrag(null);
    if (region.width < MIN_REGION_CSS_PX || region.height < MIN_REGION_CSS_PX) return;
    onConfirm(region, { width: box.width, height: box.height });
  };

  const rect = drag ? normalizeDrag(drag.start, drag.end) : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drag surface, not a control
    <div
      className="llmt-crop"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <img className="llmt-crop__img" src={imageUrl} alt="" draggable={false} />
      {rect ? (
        <div
          className="llmt-crop__region"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        />
      ) : (
        <div className="llmt-crop__mask" />
      )}
      <div className="llmt-crop__hint">{t('imageCaptureHint')}</div>
      {showNotice && (
        <div className="llmt-crop__notice">
          <span>{t('imagePrivacyNotice')}</span>
          <button type="button" className="llmt-link" onClick={onNoticeDismiss}>
            {t('imagePrivacyGotIt')}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 样式**

新建 `src/ui/image/image.css`(选中区用超大 box-shadow 压暗四周,避免四块遮罩拼接):

```css
.llmt-crop {
  position: absolute;
  inset: 0;
  cursor: crosshair;
  user-select: none;
  overflow: hidden;
  touch-action: none;
}
.llmt-crop__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.llmt-crop__mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.llmt-crop__region {
  position: absolute;
  outline: 2px solid #4c8dff;
  box-shadow: 0 0 0 100000px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.llmt-crop__hint,
.llmt-crop__notice {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 20, 20, 0.85);
  color: #fff;
  font-size: 13px;
  line-height: 1.4;
  padding: 6px 12px;
  border-radius: 6px;
  pointer-events: none;
  max-width: min(90%, 560px);
}
.llmt-crop__hint {
  top: 16px;
}
.llmt-crop__notice {
  bottom: 16px;
  pointer-events: auto;
  display: flex;
  gap: 10px;
  align-items: center;
}
/* Fixed full-viewport host used by the content script. */
.llmt-capture-host {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
}
/* Centered streaming panel host for the image result. */
.llmt-image-panel {
  position: fixed;
  left: 50%;
  top: 20%;
  transform: translateX(-50%);
  z-index: 2147483646;
}
```

- [ ] **Step 4: 校验并提交**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS。

```bash
pnpm format && git add src/ui/image/CropOverlay.tsx src/ui/image/image.css src/i18n/messages.ts
git commit -m "feat(ui): shared CropOverlay drag-select component"
```

---

### Task 9: ImageResultPanel 流式译文卡片

**Files:**
- Create: `src/ui/image/ImageResultPanel.tsx`

**Interfaces:**
- Consumes: `openTranslateStream`(既有 `@/messaging/port-client`)、`translate-image` 请求(T5)、`ImageAttachment`(T1)、`LANGUAGES`(既有 `@/languages`)
- Produces(T10/T11 使用):`<ImageResultPanel image targetLang onTargetLangChange onOpenSettings onClose />`;错误态永远附带 vision 提示 + "打开设置"按钮(grill 决策:不做模型能力探测,错误侧引导)。
- 新 i18n keys:`imageNoVisionHint`、`imageOpenSettings`。

- [ ] **Step 1: 加 i18n key**

EN(Image Translation 分组内追加):

```ts
  imageNoVisionHint:
    'If this keeps failing, the model may not accept images — set a vision-capable model for Image Translation in Routing.',
  imageOpenSettings: 'Open settings',
```

ZH:

```ts
  imageNoVisionHint: '若持续失败,可能是当前模型不支持图片输入 —— 请在「路由」中为图片翻译指定支持视觉的模型。',
  imageOpenSettings: '打开设置',
```

- [ ] **Step 2: 实现组件**

新建 `src/ui/image/ImageResultPanel.tsx`(结构与 `TranslatePanel` 同款视觉语言,复用 `llmt-panel` 系列 class;流式 → done/error):

```tsx
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/useI18n';
import { LANGUAGES } from '@/languages';
import type { ImageAttachment } from '@/llm/types';
import { openTranslateStream } from '@/messaging/port-client';

interface Props {
  image: ImageAttachment;
  targetLang: string;
  onTargetLangChange: (code: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

type Status = 'streaming' | 'done' | 'error';

export function ImageResultPanel({
  image,
  targetLang,
  onTargetLangChange,
  onOpenSettings,
  onClose,
}: Props) {
  const t = useT();
  const [lang, setLang] = useState(targetLang);
  const [attempt, setAttempt] = useState(0);
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<Status>('streaming');
  const [error, setError] = useState('');

  useEffect(() => {
    setOutput('');
    setStatus('streaming');
    setError('');
    const handle = openTranslateStream(
      { kind: 'translate-image', feature: 'image', image, vars: { targetLang: lang } },
      {
        onDelta: (chunk) => setOutput((prev) => prev + chunk),
        onDone: () => setStatus('done'),
        onError: (message) => {
          setStatus('error');
          setError(message);
        },
      },
    );
    return () => handle.cancel();
  }, [image, lang, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="llmt-panel llmt-image-panel" role="dialog" aria-label={t('imageTranslate')}>
      <div className="llmt-panel__head">
        <span className="llmt-panel__grip" aria-hidden="true">
          {t('imageTranslate')}
        </span>
        <button type="button" className="llmt-x" onClick={onClose} aria-label={t('panelClose')}>
          ×
        </button>
      </div>

      <div className="llmt-panel__body">
        {status === 'error' ? (
          <>
            <p className="llmt-error">{error}</p>
            <p className="llmt-muted">{t('imageNoVisionHint')}</p>
            <button type="button" className="llmt-link" onClick={onOpenSettings}>
              {t('imageOpenSettings')}
            </button>
          </>
        ) : (
          <p className="llmt-text">
            {output || <span className="llmt-muted">{t('panelTranslating')}</span>}
          </p>
        )}
      </div>

      <div className="llmt-panel__foot">
        <label className="llmt-lang">
          <span aria-hidden="true">→</span>
          <select
            className="llmt-lang__select"
            value={lang}
            aria-label={t('targetLanguage')}
            onChange={(e) => {
              setLang(e.target.value);
              onTargetLangChange(e.target.value);
            }}
          >
            {!LANGUAGES.some((l) => l.code === lang) && <option value={lang}>{lang}</option>}
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div className="llmt-actions">
          <button type="button" className="llmt-link" onClick={() => setAttempt((a) => a + 1)}>
            {t('panelRetry')}
          </button>
          <button
            type="button"
            className="llmt-link"
            disabled={!output}
            onClick={() => navigator.clipboard?.writeText(output)}
          >
            {t('panelCopy')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

注意:`imageTranslate` key 在 Step 1 一并加上(EN `'Image translation'` / ZH `'图片翻译'`),它同时被 T11/T12 复用。

- [ ] **Step 3: 校验并提交**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS。

```bash
pnpm format && git add src/ui/image/ImageResultPanel.tsx src/i18n/messages.ts
git commit -m "feat(ui): streaming ImageResultPanel with vision-error guidance"
```

---

### Task 10: content 集成(原地框选路径)

**Files:**
- Create: `src/ui/image/ImageCaptureApp.tsx`
- Modify: `src/entrypoints/content.tsx`
- Modify: `src/storage/index.ts`(首次提示 flag helpers)

**Interfaces:**
- Consumes: `ContentMessage 'open-image-capture'` / `TabMessage 'open-options'`(T5)、`CropOverlay`(T8)、`ImageResultPanel`(T9)、`cropToAttachment`(T7)
- Produces:
  - storage helpers(T11 复用):`getImageNoticeSeen(): Promise<boolean>` / `setImageNoticeSeen(): Promise<void>`
  - content script 对 `open-image-capture` 消息的响应能力(T12 的 launch 依赖此返回成功)

- [ ] **Step 1: storage 提示 flag**

`src/storage/index.ts` 追加:

```ts
// One-time privacy notice for Image Translation (ADR-0006). Not part of
// AppSettings: it's a UI acknowledgement, not a user preference.
const imageNoticeItem = storage.defineItem<boolean>('local:imageNoticeSeen', {
  fallback: false,
});

export function getImageNoticeSeen(): Promise<boolean> {
  return imageNoticeItem.getValue();
}

export function setImageNoticeSeen(): Promise<void> {
  return imageNoticeItem.setValue(true);
}
```

- [ ] **Step 2: 实现 ImageCaptureApp**

新建 `src/ui/image/ImageCaptureApp.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { cropToAttachment } from '@/capture/crop';
import type { Rect } from '@/capture/geometry';
import type { ImageAttachment } from '@/llm/types';
import type { ContentMessage, TabMessage } from '@/messaging/protocol';
import { getImageNoticeSeen, getSettings, setImageNoticeSeen, updateSettings } from '@/storage';
import { CropOverlay } from './CropOverlay';
import { ImageResultPanel } from './ImageResultPanel';

type Stage =
  | { kind: 'idle' }
  | { kind: 'select'; imageDataUrl: string }
  | { kind: 'result'; attachment: ImageAttachment };

export function ImageCaptureApp() {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [noticeSeen, setNoticeSeen] = useState(true);

  useEffect(() => {
    const onMessage = (message: ContentMessage) => {
      if (message?.type !== 'open-image-capture') return;
      void getSettings().then((s) => setTargetLang(s.general.targetLang));
      void getImageNoticeSeen().then(setNoticeSeen);
      setStage({ kind: 'select', imageDataUrl: message.imageDataUrl });
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  if (stage.kind === 'idle') return null;

  if (stage.kind === 'select') {
    return (
      <div className="llmt-capture-host">
        <CropOverlay
          imageUrl={stage.imageDataUrl}
          showNotice={!noticeSeen}
          onNoticeDismiss={() => {
            setNoticeSeen(true);
            void setImageNoticeSeen();
          }}
          onCancel={() => setStage({ kind: 'idle' })}
          onConfirm={(region: Rect, container) => {
            void cropToAttachment(stage.imageDataUrl, region, container).then((attachment) =>
              setStage({ kind: 'result', attachment }),
            );
          }}
        />
      </div>
    );
  }

  return (
    <ImageResultPanel
      image={stage.attachment}
      targetLang={targetLang}
      onTargetLangChange={(code) => {
        setTargetLang(code);
        // Persisting to the global default mirrors Selection Translation.
        void getSettings().then((s) =>
          updateSettings({ general: { ...s.general, targetLang: code } }),
        );
      }}
      onOpenSettings={() => {
        void browser.runtime.sendMessage({ type: 'open-options' } satisfies TabMessage);
      }}
      onClose={() => setStage({ kind: 'idle' })}
    />
  );
}
```

- [ ] **Step 3: 挂载到 content**

`src/entrypoints/content.tsx`:顶部加 `import '@/ui/image/image.css';`(与 `./selection.css` 并列,WXT 会一起打进 shadow root)与 `import { ImageCaptureApp } from '@/ui/image/ImageCaptureApp';`;render 处:

```tsx
        root.render(
          <>
            <SelectionApp />
            <PageToolbar />
            <ImageCaptureApp />
          </>,
        );
```

- [ ] **Step 4: 校验并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS。

```bash
pnpm format && git add src/ui/image/ImageCaptureApp.tsx src/entrypoints/content.tsx src/storage/index.ts
git commit -m "feat(content): in-place Image Translation over a frozen capture"
```

---

### Task 11: workbench 扩展页(降级 + 粘贴/上传)

**Files:**
- Create: `src/entrypoints/image-translate/index.html`
- Create: `src/entrypoints/image-translate/main.tsx`
- Create: `src/entrypoints/image-translate/App.tsx`
- Create: `src/entrypoints/image-translate/style.css`

**Interfaces:**
- Consumes: `takePendingCapture`(T7)、`imageFileToAttachment`/`cropToAttachment`(T7)、`CropOverlay`(T8)、`ImageResultPanel`(T9)、notice helpers(T10)
- Produces: 扩展页 `/image-translate.html`(T12 的 launch 跳转目标;WXT 会把 entrypoint 目录名生成为该路径并加入 `PublicPath` 类型)
- 新 i18n keys:`imageWorkbenchEmpty`、`imageUpload`、`imageReselect`。

- [ ] **Step 1: 加 i18n key**

EN:

```ts
  imageWorkbenchEmpty: 'Paste, drop, or choose an image to translate.',
  imageUpload: 'Choose image',
  imageReselect: 'Select another area',
```

ZH:

```ts
  imageWorkbenchEmpty: '粘贴、拖入或选择一张图片进行翻译。',
  imageUpload: '选择图片',
  imageReselect: '重新框选',
```

- [ ] **Step 2: 静态骨架**

`index.html`(对照 `src/entrypoints/popup/index.html` 的结构,title 用占位,运行时由 App 设置为 BRAND):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Image translation</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`main.tsx`:

```tsx
import './style.css';
import '@/ui/image/image.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`style.css`:

```css
body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #f5f6f8;
  color: #1c1e21;
}
.wb {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.wb__title {
  font-size: 18px;
  margin: 0 0 16px;
}
.wb__stage {
  position: relative;
  border: 1px solid #d7dade;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.wb__stage img.wb__preview {
  display: block;
  width: 100%;
  height: auto;
}
.wb__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 72px 16px;
  color: #5f6368;
  border: 2px dashed #c6cbd2;
  border-radius: 8px;
  background: #fff;
}
.wb__btn {
  padding: 8px 16px;
  border: 1px solid #c6cbd2;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.wb__bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
```

- [ ] **Step 3: 实现 App**

`App.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { BRAND } from '@/brand';
import { cropToAttachment, imageFileToAttachment } from '@/capture/crop';
import { takePendingCapture } from '@/capture/session';
import { setUiLanguage } from '@/i18n';
import { useT } from '@/i18n/useI18n';
import type { ImageAttachment } from '@/llm/types';
import {
  getImageNoticeSeen,
  getSettings,
  setImageNoticeSeen,
  updateSettings,
} from '@/storage';
import { CropOverlay } from '@/ui/image/CropOverlay';
import { ImageResultPanel } from '@/ui/image/ImageResultPanel';

type Stage =
  | { kind: 'empty' }
  | { kind: 'select'; imageDataUrl: string }
  | { kind: 'result'; imageDataUrl: string; attachment: ImageAttachment };

export function App() {
  const t = useT();
  const [stage, setStage] = useState<Stage>({ kind: 'empty' });
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [noticeSeen, setNoticeSeen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = BRAND.name;
    void (async () => {
      const settings = await getSettings();
      setUiLanguage(settings.general.uiLang);
      setTargetLang(settings.general.targetLang);
      setNoticeSeen(await getImageNoticeSeen());
      const pending = await takePendingCapture();
      if (pending) setStage({ kind: 'select', imageDataUrl: pending });
    })();
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith('image/'),
      );
      if (file) void acceptFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  async function acceptFile(file: Blob) {
    // Uploaded images translate whole by default; the crop stage still allows
    // narrowing, so route them through select for consistency.
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    });
    setStage({ kind: 'select', imageDataUrl: dataUrl });
  }

  const dismissNotice = () => {
    setNoticeSeen(true);
    void setImageNoticeSeen();
  };

  return (
    <main
      className="wb"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
        if (file) void acceptFile(file);
      }}
    >
      <h1 className="wb__title">{t('imageTranslate')}</h1>

      {stage.kind === 'empty' ? (
        <div className="wb__empty">
          <p>{t('imageWorkbenchEmpty')}</p>
          <button type="button" className="wb__btn" onClick={() => fileRef.current?.click()}>
            {t('imageUpload')}
          </button>
        </div>
      ) : (
        <div className="wb__stage">
          <img className="wb__preview" src={stage.imageDataUrl} alt="" draggable={false} />
          {stage.kind === 'select' && (
            <CropOverlay
              imageUrl={stage.imageDataUrl}
              showNotice={!noticeSeen}
              onNoticeDismiss={dismissNotice}
              onCancel={() => setStage({ kind: 'empty' })}
              onConfirm={(region, container) => {
                void cropToAttachment(stage.imageDataUrl, region, container).then((attachment) =>
                  setStage({ kind: 'result', imageDataUrl: stage.imageDataUrl, attachment }),
                );
              }}
            />
          )}
        </div>
      )}

      {stage.kind === 'result' && (
        <>
          <div className="wb__bar">
            <button
              type="button"
              className="wb__btn"
              onClick={() => setStage({ kind: 'select', imageDataUrl: stage.imageDataUrl })}
            >
              {t('imageReselect')}
            </button>
          </div>
          <ImageResultPanel
            image={stage.attachment}
            targetLang={targetLang}
            onTargetLangChange={(code) => {
              setTargetLang(code);
              void getSettings().then((s) =>
                updateSettings({ general: { ...s.general, targetLang: code } }),
              );
            }}
            onOpenSettings={() => void browser.runtime.openOptionsPage()}
            onClose={() => setStage({ kind: 'select', imageDataUrl: stage.imageDataUrl })}
          />
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void acceptFile(file);
          e.target.value = '';
        }}
      />
    </main>
  );
}
```

注意:CropOverlay 在 `.wb__stage`(position:relative,因 overlay 是 absolute inset-0)内铺满预览图,region 坐标相对显示尺寸,`cropToAttachment` 用 container 尺寸换算到原图像素——与 content 路径同一套几何。`.wb__stage` 已有 `position: relative`?没有——Step 2 的 css 里 `.wb__stage` 需要 `position: relative;`(已写)。

- [ ] **Step 4: 构建校验并提交**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS;`.output/chrome-mv3/image-translate.html` 存在。

```bash
pnpm format && git add src/entrypoints/image-translate src/i18n/messages.ts
git commit -m "feat(workbench): image-translate page with capture hand-off, paste and upload"
```

---

### Task 12: 入口接线(launch + background 菜单 + popup + manifest)

**Files:**
- Create: `src/capture/launch.ts`
- Modify: `src/entrypoints/background.ts`
- Modify: `src/entrypoints/popup/App.tsx`
- Modify: `wxt.config.ts`

**Interfaces:**
- Consumes: `stashPendingCapture`(T7)、`/image-translate.html`(T11)、`ContentMessage 'open-image-capture'`(T5→T10)、`TabMessage 'open-options'`(T5)、`hasHostAccess`/`focusOrOpenOnboarding`(既有 `@/permissions`)、i18n key `imageTranslate`(T9)
- Produces: popup 按钮、右键菜单项 `llmt-translate-image`、`activeTab` 权限

- [ ] **Step 1: 实现 launch.ts**

```ts
import { focusOrOpenOnboarding, hasHostAccess } from '@/permissions';
import { stashPendingCapture } from './session';

/**
 * Shared Image Translation launcher (popup & background): capture the visible
 * area first (the overlay must never contaminate it), try the in-place path,
 * fall back to the workbench when the tab has no content script (ADR-0006).
 */
export async function launchImageCapture(tabId: number | undefined): Promise<void> {
  let dataUrl: string | null = null;
  try {
    dataUrl = await browser.tabs.captureVisibleTab(undefined, { format: 'png' });
  } catch {
    // Restricted URL (chrome:// / about:) or missing host access on Firefox.
    if (!(await hasHostAccess())) {
      await focusOrOpenOnboarding();
      return;
    }
  }

  if (dataUrl != null && tabId != null) {
    try {
      await browser.tabs.sendMessage(tabId, {
        type: 'open-image-capture',
        imageDataUrl: dataUrl,
      });
      return; // In-place path took over.
    } catch {
      // No content script here — use the workbench.
    }
  }

  // Workbench fallback; with no capture it opens on the paste/upload empty state.
  if (dataUrl != null) await stashPendingCapture(dataUrl);
  await browser.tabs.create({ url: browser.runtime.getURL('/image-translate.html'), active: true });
}
```

- [ ] **Step 2: background 接线**

`src/entrypoints/background.ts`:

1. 顶部 import 追加 `import { launchImageCapture } from '@/capture/launch';`
2. 菜单常量区追加 `const MENU_IMAGE = 'llmt-translate-image';`
3. `refreshMenusForActiveTab` 里,对 `MENU_SELECTION` 的 update 后追加同款(保持各自独立 try/catch):

```ts
  try {
    await browser.contextMenus.update(MENU_IMAGE, { title: t('imageTranslate') });
  } catch {
    // ignore
  }
```

4. `onInstalled` 里创建菜单处追加:

```ts
    browser.contextMenus.create({
      id: MENU_IMAGE,
      title: t('imageTranslate'),
      contexts: ['page'],
    });
```

5. `contextMenus.onClicked` 监听器改为(image 走 launch,不走 sendMessage-only 路径):

```ts
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id == null) return;
    if (info.menuItemId === MENU_IMAGE) {
      void launchImageCapture(tab.id);
      return;
    }
    const message: ContentMessage | null =
      info.menuItemId === MENU_PAGE
        ? { type: 'translate-page' }
        : info.menuItemId === MENU_SELECTION
          ? { type: 'open-selection-panel' }
          : null;
    if (message)
      void browser.tabs.sendMessage(tab.id, message).catch(async () => {
        if (!(await hasHostAccess())) await focusOrOpenOnboarding();
      });
  });
```

6. `runtime.onMessage` 监听器扩展处理 `open-options`:

```ts
  browser.runtime.onMessage.addListener((message: TabMessage, sender) => {
    if (message?.type === 'page-status-changed' && sender.tab?.active) {
      void syncPageMenu(message.status);
    } else if (message?.type === 'open-options') {
      void browser.runtime.openOptionsPage();
    }
  });
```

- [ ] **Step 3: popup 按钮**

`src/entrypoints/popup/App.tsx`:import 追加 `import { launchImageCapture } from '@/capture/launch';`;在"翻译此页"按钮之后、"打开设置"按钮之前插入:

```tsx
        <button
          type="button"
          className="popup__btn"
          onClick={async () => {
            const tab = await getActiveTab();
            await launchImageCapture(tab?.id);
            window.close();
          }}
        >
          {t('imageTranslate')}
        </button>
```

- [ ] **Step 4: manifest 权限**

`wxt.config.ts` 的 permissions 行替换为(注释同步更新):

```ts
    // storage:      local persistence of settings & translation cache (ADR-0002)
    // contextMenus: right-click "Translate page / selection / Image Translation" (T3.10, ADR-0006)
    // activeTab:    captureVisibleTab for Image Translation keeps working on Firefox
    //               after optional host access is revoked (ADR-0006)
    permissions: ['storage', 'contextMenus', 'activeTab'],
```

同文件 description 更新为:

```ts
    description:
      'Selection, full-page & image translation powered by your own OpenAI-compatible or Anthropic-compatible LLM API.',
```

- [ ] **Step 5: 校验并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm verify:firefox`
Expected: 全部 PASS;Firefox manifest 校验通过(permissions 变更被脚本接受)。

```bash
pnpm format && git add src/capture/launch.ts src/entrypoints/background.ts src/entrypoints/popup/App.tsx wxt.config.ts
git commit -m "feat(entries): popup and context-menu Image Translation with workbench fallback"
```

---

### Task 13: options 面板(Routing 第三项 + Prompts 覆盖)

**Files:**
- Modify: `src/entrypoints/options/DefaultsPanel.tsx`
- Modify: `src/entrypoints/options/PromptsPanel.tsx`
- Modify: `src/i18n/messages.ts`

**Interfaces:**
- Consumes: `ProfileDefaults.image`(T4)、`PromptOverrides.imageText`(T3)
- Produces: 设置页可为 Image Translation 配置 Feature Override 与 prompt 覆盖
- 新 i18n keys:`routingImage`、`promptImageLabel`、`promptImageHint`。

- [ ] **Step 1: 加 i18n key**

EN(Routing 分组追加 `routingImage: 'Image translation',`;Prompts 分组追加):

```ts
  promptImageLabel: 'Image translation',
  promptImageHint: 'Vision prompt — the image is attached to the message; only {{targetLang}} is interpolated.',
```

ZH(对应分组):

```ts
  routingImage: '图片翻译',
  promptImageLabel: '图片翻译',
  promptImageHint: '视觉提示词 —— 图片随消息附带,仅支持 {{targetLang}} 变量。',
```

- [ ] **Step 2: DefaultsPanel 第三个 select**

`src/entrypoints/options/DefaultsPanel.tsx` 的 `defaults__grid` 内、page select 之后追加:

```tsx
        <label className="field">
          <span className="field__label">{t('routingImage')}</span>
          <select
            className="field__input"
            value={defaults.image ?? ''}
            onChange={(e) => onChange({ ...defaults, image: e.target.value || undefined })}
          >
            <option value="">{t('routingUseGlobal')}</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {name(p)}
              </option>
            ))}
          </select>
        </label>
```

- [ ] **Step 3: PromptsPanel 增加条目**

`ENTRIES` 数组追加:

```ts
  { key: 'imageText', labelKey: 'promptImageLabel', hintKey: 'promptImageHint' },
```

- [ ] **Step 4: 校验并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS。

```bash
pnpm format && git add src/entrypoints/options/DefaultsPanel.tsx src/entrypoints/options/PromptsPanel.tsx src/i18n/messages.ts
git commit -m "feat(options): Image Translation routing override and prompt entry"
```

---

### Task 14: 文档同步 + 全量验证 + 手工冒烟

**Files:**
- Modify: `README.md` / `README.zh-CN.md`(功能列表加 Image Translation 一条,措辞用 CONTEXT.md 词条)
- Modify: `docs/plan.md` / `docs/plan.zh-CN.md`(补一节:Image Translation 一期落地,二期=右键图片直翻+快捷键,引用 ADR-0006)
- Modify: `docs/privacy-policy.md` / `docs/privacy-policy.zh-CN.md`(新增章节:框选区域图像仅发送至用户配置的 API 端点;不落盘、不缓存)
- Modify: `package.json`(description 与 wxt.config.ts 保持一致)

- [ ] **Step 1: 更新四组文档 + package.json description**

各文件遵循既有双语行文;privacy-policy 新章节标题 EN `## Image Translation` / ZH `## 图片翻译`,内容三点:发送目标(仅用户配置的端点)、不持久化(不写盘、不缓存,storage.session 暂存在浏览器关闭时清除)、首次使用有一次性提示。

- [ ] **Step 2: 全量验证**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm verify:firefox`
Expected: 全部 PASS。

- [ ] **Step 3: 手工冒烟清单(`pnpm dev` 装载后逐项勾)**

1. 普通文章页:popup 点「图片翻译」→ 画面冻结 → 拖框 → 原地流式出卡片;Esc 取消;<8px 拖拽无反应。
2. 同页:右键菜单「图片翻译」同上;首次使用出现隐私提示,「知道了」后不再出现。
3. 浏览器内置 PDF 阅读器(打开任一 https PDF):popup 点「图片翻译」→ 新开 workbench,截图已就位 → 拖框 → 出译文。
4. `chrome://extensions` 页:popup 点「图片翻译」→ workbench 空态(粘贴/上传提示)。
5. workbench:粘贴一张截图 / 拖入一个 PNG → 框选 → 出译文;「重新框选」可重来。
6. 把图片翻译的 Feature Override 指到不支持 vision 的模型(如 DeepSeek-chat):报错卡片含引导文案,「打开设置」跳转设置页;Routing 面板第三个下拉可改回。
7. 卡片内切换目标语言 → 重新翻译,且全局默认目标语言被更新(与划词一致的既有行为)。
8. Firefox(`pnpm dev:firefox`):撤销站点权限后触发图片翻译 → 跳转权限引导页;授权后流程恢复。

- [ ] **Step 4: 提交**

```bash
git add README.md README.zh-CN.md docs/plan.md docs/plan.zh-CN.md docs/privacy-policy.md docs/privacy-policy.zh-CN.md package.json
git commit -m "docs: document Image Translation across README, plan and privacy policy"
```

---

## Self-Review 记录(计划完成时已核对)

- **规格覆盖**:ADR-0006 全部 Consequences 各有归属任务(多模态+测试→T1/T2/T5;压缩→T6/T7;隐私提示→T8/T10/T11 + T14;activeTab→T12;一期范围→T11/T12;无缓存→T5)。grill 决策中的"错误引导深链设置"以 T9 错误态 + T12 `open-options` 落地。
- **占位符扫描**:无 TBD/TODO;所有代码步骤均含完整代码。
- **类型一致性**:`ImageAttachment`(T1)、`TranslateFeature`(T4)、`Rect`(T6)、`cropToAttachment(sourceDataUrl, regionCss, container)`(T7→T10/T11)、`CropOverlay onConfirm(regionCss, container)`(T8→T10/T11)、i18n key 归属任务(T8/T9/T11/T13)已交叉核对。
- **明确不在本计划**(二期,勿实现):右键图片元素直翻、快捷键 command、图片翻译缓存、识别原文对照模式。
