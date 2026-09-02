# Provider / Model Split(Provider 与模型配置拆分)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把今天扁平的 `ProviderProfile`(protocol + baseUrl + apiKey + model + params 挤在一条记录里)拆成两层:`LlmProvider` 只管连接,`ModelProfile` 只管「在哪个连接上用哪个模型」。用户想在同一个网关上换模型时,只需新增一条模型配置并从下拉里选 provider,不再重填 Base URL 和 API Key;换 key 时也只改一处。

**Architecture:** 只拆**存储态**。`AppSettings` 从 v1 升到 v2,新增 `models: ModelProfile[]`,`providers` 瘦身为 `LlmProvider[]`,`defaults.*` 改为指向 **ModelProfile.id**。运行时仍然是一个扁平结构(旧名 `ProviderProfile` 重命名为 `ResolvedProfile`),由 `resolveProfileFrom()` 把 provider 和 model join 出来,所以 `src/llm/` 三个 adapter 的业务逻辑完全不动。v1 → v2 迁移做**无损 1:1 拆分**(一条旧 profile 变一个 provider 加一个 model,model 沿用旧 id,`defaults` 因此不需要任何重映射),收敛留给设置页里一个用户显式点击的「合并重复 provider」动作。

**Tech Stack:** WXT 0.20 (MV3, srcDir=src) · React 19 · TypeScript · Vitest (happy-dom) · Biome

## Global Constraints

- Node >= 20.19.0,包管理器 **pnpm@9.15.9**(Node 20 只能配 pnpm 9.15,勿升级)。
- 验证命令:`pnpm typecheck` / `pnpm lint` / `pnpm test`;提交前跑 `pnpm format`(Biome 会改格式)。
- i18n:`src/i18n/messages.ts` 里 EN 是 source of truth,ZH 必须定义相同 key(类型强制,少 key 会 typecheck 失败);所有 UI 文案必须过 `t()`,禁止硬编码。
- 术语:见 Task 0 更新后的 CONTEXT.md。连接层一律 **LLM Provider**,模型层一律 **Model Profile / 模型配置**;禁用「translate model」「服务商配置」「Provider Profile」指代新的任一实体。
- Commit 规范:conventional commits(`feat:` / `fix:` / `docs:` / `refactor:` / `test:`),每个任务至少一次提交,测试与实现同一提交。
- 双平台:Chrome/Edge MV3 + Firefox MV3;本计划不改 manifest,但 T8 仍要跑 `pnpm verify:firefox`。
- **向后兼容是硬要求**:任何一个 v0.3.0 及更早版本导出的 settings JSON 都必须能原样导入;任何一个已安装用户升级后设置不能丢。
- 浏览器 API 一律用全局 `browser.*`(WXT 提供),不要 import `chrome`。

## 决策记录(grill 会话已拍板,勿翻案)

1. **迁移不做任何自动去重**。一条旧 profile 拆成一个 provider 加一个 model,即使三条 profile 的 protocol/baseUrl/apiKey 完全相同也各建一个 provider。收敛由 T6 的合并横幅承担,用户点一次按钮完成。
2. **测连接拆成两个**。`test-provider` 走 listModels,只验鉴权与可达;`test-model` 发一次 `max_tokens=1` 的 completion。同时 **`client.ts` 里 `listModels` 的吞异常包装整个删掉**:它把 401 变成 `[]`,界面于是显示「未返回模型,请手动填写模型名」,把一个鉴权失败伪装成一个空结果。`[]` 只应该表示「这个端点确实没有模型」。异常放出来之后,`test-provider` 在 handler 里用一个小 try/catch 就能实现,`TranslationClient` 接口不用动。
3. **`defaults.image` 的两处静默丢配置 bug 并入本 PR 修复**(T1 的 `pruneDefaults` + T3 的 defaults 读取循环)。
4. **命名**:存储层两个类型叫 `LlmProvider` 和 `ModelProfile`;join 出来的运行时类型由 `ProviderProfile` 重命名为 `ResolvedProfile`。沿用 `ProviderProfile` 这个名字指代 join 结果会和 CONTEXT.md 里的词条长期冲突,所以做一次机械重命名(T4)。

## 文件结构总览

```
src/storage/
  migrate.ts        # 新增:isRecord、migrateV1、migrateSettings(纯函数,读路径与导入路径共用)
  schema.ts         # 改:AppSettings v2、resolveProfileFrom join、joinProfile、resolveForProvider、
                    #     pruneDefaults、countMergeableProviders、mergeDuplicateProviders
  index.ts          # 改:getSettings 惰性迁移写回、updateSettings 基于已迁移值、watchSettings 迁移
  import-export.ts  # 改:版本分派、normalizeProvider / normalizeModel、defaults 按 feature 循环
src/llm/
  types.ts          # 改:LlmProvider、ModelProfile、ResolvedProfile(TranslationClient 接口不变)
  client.ts         # 改:类型重命名 + 删掉 listModels 的吞异常包装
  openai.ts         # 改:仅类型重命名
  anthropic.ts      # 改:仅类型重命名
src/messaging/
  protocol.ts       # 改:list-models 收 providerId;test-connection 拆为 test-provider / test-model
  handler.ts        # 改:三个分支重写
src/entrypoints/options/
  ProviderCard.tsx        # 改:只留 name / protocol / baseUrl / apiKey / Test provider / Delete
  ModelCard.tsx           # 新增:name / provider 下拉 / model + Fetch models / 高级参数 / Test model
  MergeProvidersBanner.tsx # 新增:检测到可合并 provider 时的一键合并横幅
  App.tsx                 # 改:新增 models section、两套增删、合并动作接线
  DefaultsPanel.tsx       # 改:下拉源从 providers 换成 models
  style.css               # 改:合并横幅样式、provider 删除禁用态提示
src/i18n/messages.ts      # 改:新增/改写 EN + ZH 文案
```

修改的其他文件:`CONTEXT.md`、`CONTEXT.zh-CN.md`、`docs/adr/0007-*.md`(新增双语)、`docs/adr/0004-provider-profile-name-optional.md`(双语,加一段说明)、`docs/plan.md`、`docs/plan.zh-CN.md`、`e2e/support.ts`、`tests/storage/schema.test.ts`、`tests/storage/storage.test.ts`、`tests/messaging/handler.test.ts`、`tests/llm/*.test.ts`。

**任务依赖**:T0 独立(先做,后续命名依赖它)→ T1 是起点 → T2 / T3 / T4 并行依赖 T1 → T5 依赖 T1 + T4 → T6 / T7 依赖 T1 + T5 → T8 收尾。

---

### Task 0: 词汇与 ADR 对齐

先把术语钉死,后面所有代码和文案照抄。

**Files:**
- Modify: `CONTEXT.md`、`CONTEXT.zh-CN.md`
- Create: `docs/adr/0007-split-provider-and-model-profile.md`、`docs/adr/0007-split-provider-and-model-profile.zh-CN.md`
- Modify: `docs/adr/0004-provider-profile-name-optional.md`、`docs/adr/0004-provider-profile-name-optional.zh-CN.md`

- [ ] **Step 1: 重写 CONTEXT.md 的 Provider 小节**

`### Provider` 下的四个词条整体替换为五个(EN,ZH 对应改 `CONTEXT.zh-CN.md`):

```
**LLM Provider (LLM Provider)**:
One saved connection to an LLM endpoint: a Protocol, a Base URL and an API Key, plus an optional
default timeout. It carries no model name. Several Model Profiles can share one.
_Avoid_: provider profile, translation engine, vendor, channel, account

**Model Profile (模型配置)**:
A named choice of one model on one LLM Provider, plus optional parameters (temperature, max tokens,
timeout). This is the unit routing points at, and the unit a user adds when they want the same
endpoint with a different model.
_Avoid_: translate model, model entry, provider profile

**Protocol (协议类型)**:
The API shape an LLM Provider follows; there are only two: OpenAI-compatible, Anthropic-compatible.
_Avoid_: vendor type, interface type

**Global Default Model (全局默认模型)**:
The Model Profile that every translation feature actually uses when it is not overridden at the
feature level.
_Avoid_: current engine, active profile, global default provider

**Feature Override (功能级覆盖)**:
A Model Profile specified separately for Selection Translation, Page Translation, or Screenshot
Translation; once set, it takes precedence over the Global Default Model, and when unset it follows
the global one.
_Avoid_: standalone config, per-channel
```

同时把 Screenshot Translation 词条末句里的 `the resolved Provider Profile's model` 改成 `the resolved Model Profile's model`(EN 第 40 行附近,ZH 对应行)。

- [ ] **Step 2: 写 ADR-0007(双语)**

标题:`# Split the flat Provider Profile into an LLM Provider and a Model Profile`。要覆盖的 Consequences:

- `defaults.*` 指向 `ModelProfile.id`,不指向 provider;否则同一连接下无法给 selection 与 page 配不同模型,这次改动的动机就没了。
- 拆分只落在存储态。运行时 join 出 `ResolvedProfile`,`src/llm/` 的协议实现不感知拆分。
- v1 → v2 迁移是无损 1:1 拆分,**不做任何自动去重**。同一 baseUrl 下两个不同账号的 key 一旦被自动合并,请求会打到错误的 key 上,计费与额度串号,这个风险不能由迁移代码替用户承担。收敛改由设置页里一个显式的合并动作完成,合并键是 (protocol, baseUrl, apiKey) 三者全等。
- ModelProfile 沿用旧 profile 的 id,`defaults` 无需重映射,迁移代码不碰 routing。
- `params`(temperature / maxTokens / timeoutMs)归 ModelProfile;`LlmProvider.timeoutMs` 只是一个可被 model 覆盖的连接级默认。把 params 上提到 provider 会让同一连接下的两个模型无法配不同 temperature,等于制造一个与原问题同构的新痛点。
- 连接自检与模型自检是两件事,拆成 `test-provider`(listModels,验鉴权与可达)和 `test-model`(一次 completion)。合成一个会让「模型名打错」和「key 失效」互相冒充,报错指向错误的字段。
- `listModels` 不再吞异常。让一个返回 `[]` 同时表示「端点没有模型」「key 失效」「网关 500」,等于把返回值的信息量清零,界面只能给出「未返回模型,请手动填写模型名」这种把用户引向错误方向的提示。异常向上抛,`list-models` 的失败照常走 `{ type: 'error' }` 事件,卡片显示真实原因。
- 删除 LLM Provider 时若仍有 ModelProfile 引用它,禁止删除并提示先处理这些模型配置;不做级联删除,避免用户误删一个连接就丢掉一批模型配置。
- 导入时 ModelProfile 的 `providerId` 必须能在同一份文件里找到对应 provider,否则报错。孤儿模型配置无法翻译,静默接受只会把问题推迟到用户真正翻译时。

- [ ] **Step 3: 给 ADR-0004 补一段(双语)**

原结论「name 可空、id / baseUrl / model 必填」在 v2 下拆到两个类型上,追加一段:

```
## Amendment (ADR-0007)

Since ADR-0007 split the flat profile in two, the same rule now applies per type: `name` stays an
optional display label on both `LlmProvider` and `ModelProfile`; `id` and `baseUrl` are required on
`LlmProvider`; `id`, `providerId` and `model` are required on `ModelProfile`. `apiKey` stays
optional so a key-stripped export still imports.
```

- [ ] **Step 4: 提交**

```bash
git add CONTEXT.md CONTEXT.zh-CN.md docs/adr/0004-*.md docs/adr/0007-*.md
git commit -m "docs: introduce LLM Provider / Model Profile vocabulary and ADR-0007"
```

注意:`.codegraph/` 是本地索引,**不要** add(保持 untracked)。

---

### Task 1: 类型、schema 与纯函数

**Files:**
- Modify: `src/llm/types.ts`
- Modify: `src/storage/schema.ts`
- Test: `tests/storage/schema.test.ts`

**Interfaces:**
- Consumes: 无(起点任务)
- Produces: `LlmProvider`、`ModelProfile`、`ResolvedProfile`、`AppSettings`(v2)、`joinProfile`、`resolveForProvider`、`pruneDefaults`、`TRANSLATE_FEATURES`、`countMergeableProviders`、`mergeDuplicateProviders`

- [ ] **Step 1: 写失败测试**

`tests/storage/schema.test.ts` 整体重写。fixture 与用例:

```ts
import { describe, expect, it } from 'vitest';
import type { LlmProvider, ModelProfile } from '@/llm/types';
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  countMergeableProviders,
  joinProfile,
  mergeDuplicateProviders,
  pruneDefaults,
  resolveProfileFrom,
} from '@/storage/schema';

const provider = (id: string, over: Partial<LlmProvider> = {}): LlmProvider => ({
  id,
  name: id,
  protocol: 'openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk',
  ...over,
});

const model = (id: string, providerId: string, over: Partial<ModelProfile> = {}): ModelProfile => ({
  id,
  name: id,
  providerId,
  model: 'gpt-4o-mini',
  ...over,
});

function settings(over: Partial<AppSettings> = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    providers: [provider('p1')],
    models: [model('g', 'p1'), model('i', 'p1')],
    defaults: { global: 'g' },
    ...over,
  };
}

describe('resolveProfileFrom', () => {
  it('joins the model with its provider', () => {
    const resolved = resolveProfileFrom(settings(), 'selection');
    expect(resolved).toMatchObject({
      id: 'g',
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk',
      model: 'gpt-4o-mini',
    });
  });

  it('prefers the image feature override over the global default', () => {
    const s = settings({ defaults: { global: 'g', image: 'i' } });
    expect(resolveProfileFrom(s, 'image')?.id).toBe('i');
  });

  it('falls back to the global default when the feature has no override', () => {
    expect(resolveProfileFrom(settings(), 'image')?.id).toBe('g');
  });

  it('skips an override id that no longer exists', () => {
    const s = settings({ defaults: { global: 'g', image: 'gone' } });
    expect(resolveProfileFrom(s, 'image')?.id).toBe('g');
  });

  it('skips a model whose provider is missing and falls back to global', () => {
    const s = settings({
      models: [model('g', 'p1'), model('orphan', 'nope')],
      defaults: { global: 'g', image: 'orphan' },
    });
    expect(resolveProfileFrom(s, 'image')?.id).toBe('g');
  });

  it('returns null when nothing resolves', () => {
    expect(resolveProfileFrom(DEFAULT_SETTINGS, 'selection')).toBeNull();
  });
});

describe('joinProfile', () => {
  it('lets the model params win over the provider timeout', () => {
    const p = provider('p1', { timeoutMs: 60_000 });
    const m = model('m', 'p1', { params: { timeoutMs: 5_000, temperature: 0.3 } });
    expect(joinProfile(p, m).params).toEqual({ timeoutMs: 5_000, temperature: 0.3 });
  });

  it('falls back to the provider timeout when the model has none', () => {
    const p = provider('p1', { timeoutMs: 60_000 });
    expect(joinProfile(p, model('m', 'p1')).params).toEqual({ timeoutMs: 60_000 });
  });

  it('omits params entirely when neither side sets anything', () => {
    expect(joinProfile(provider('p1'), model('m', 'p1')).params).toBeUndefined();
  });
});

describe('pruneDefaults', () => {
  it('keeps every feature override that still points at a live model', () => {
    const models = [model('g', 'p1'), model('i', 'p1')];
    const kept = pruneDefaults({ global: 'g', selection: 'i', page: 'i', image: 'i' }, models);
    expect(kept).toEqual({ global: 'g', selection: 'i', page: 'i', image: 'i' });
  });

  it('drops the image override when its model is gone', () => {
    const kept = pruneDefaults({ global: 'g', image: 'gone' }, [model('g', 'p1')]);
    expect(kept).toEqual({ global: 'g' });
  });

  it('nulls a global that no longer resolves', () => {
    expect(pruneDefaults({ global: 'gone' }, [model('g', 'p1')])).toEqual({ global: null });
  });
});

describe('provider merge', () => {
  const dupes = settings({
    providers: [provider('p1'), provider('p2'), provider('p3', { apiKey: 'other' })],
    models: [model('a', 'p1'), model('b', 'p2'), model('c', 'p3')],
  });

  it('counts how many provider rows would disappear', () => {
    expect(countMergeableProviders(dupes.providers)).toBe(1);
    expect(countMergeableProviders([provider('p1'), provider('p3', { apiKey: 'x' })])).toBe(0);
  });

  it('keeps the first of each identical group and repoints the models', () => {
    const next = mergeDuplicateProviders(dupes);
    expect(next.providers.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(next.models.map((m) => m.providerId)).toEqual(['p1', 'p1', 'p3']);
  });

  it('never merges across different api keys', () => {
    const s = settings({
      providers: [provider('p1'), provider('p2', { apiKey: 'other' })],
      models: [model('a', 'p1'), model('b', 'p2')],
    });
    expect(mergeDuplicateProviders(s)).toBe(s);
  });

  it('does merge two key-stripped providers', () => {
    const s = settings({
      providers: [provider('p1', { apiKey: '' }), provider('p2', { apiKey: '' })],
      models: [model('a', 'p1'), model('b', 'p2')],
    });
    expect(mergeDuplicateProviders(s).providers).toHaveLength(1);
  });

  it('returns the same object when there is nothing to merge', () => {
    const s = settings();
    expect(mergeDuplicateProviders(s)).toBe(s);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/storage/schema.test.ts`
Expected: FAIL,`LlmProvider` / `ModelProfile` / `joinProfile` 等尚未导出(编译错)。

- [ ] **Step 3: 实现**

`src/llm/types.ts`:把 `ProviderProfile` 换成下面三个类型,并同步 `TranslationClient` 新增一个方法。

```ts
/** Tuning knobs shared by a Model Profile and a Provider's connection default. */
export interface ModelParams {
  temperature?: number;
  maxTokens?: number;
  /** Per-request timeout; defaults to 60_000ms when unset. */
  timeoutMs?: number;
}

/** One saved connection: protocol + endpoint + credential. Carries no model. */
export interface LlmProvider {
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  apiKey: string;
  /** Connection-level default; a Model Profile's own timeoutMs wins. */
  timeoutMs?: number;
}

/** One model on one provider. This is what routing points at. */
export interface ModelProfile {
  id: string;
  name: string;
  providerId: string;
  model: string;
  params?: ModelParams;
}

/** A provider joined with a model: the flat shape every adapter consumes. */
export interface ResolvedProfile {
  /** The ModelProfile id it came from (or the LlmProvider id for provider-only probes). */
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  params?: ModelParams;
}
```

`TranslationClient` 接口本身不动。连接级探测由 handler 直接 try/catch `listModels` 完成(T5),不需要新增方法。

`src/storage/schema.ts`:

```ts
import type { LlmProvider, ModelProfile, ResolvedProfile } from '@/llm/types';

// ...SelectionTrigger / PageMode / UiLang / TranslateFeature / GeneralSettings / SiteRules /
//    PromptOverrides / ProfileDefaults 原样保留...

/** Every routable feature, in one place so nothing gets forgotten again. */
export const TRANSLATE_FEATURES = ['selection', 'page', 'image'] as const satisfies
  readonly TranslateFeature[];

export interface AppSettings {
  version: 2;
  providers: LlmProvider[];
  models: ModelProfile[];
  /** Ids in here are ModelProfile ids, never LlmProvider ids. */
  defaults: ProfileDefaults;
  general: GeneralSettings;
  siteRules: SiteRules;
  prompts: PromptOverrides;
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 2,
  providers: [],
  models: [],
  defaults: { global: null },
  general: {
    targetLang: 'zh-CN',
    selectionTrigger: 'icon',
    pageMode: 'bilingual',
    uiLang: 'auto',
  },
  siteRules: { autoTranslate: [], disableSelection: [] },
  prompts: {},
};

/** Flatten a provider and a model into the shape the adapters take. */
export function joinProfile(provider: LlmProvider, model: ModelProfile): ResolvedProfile {
  const params: ModelParams = { ...model.params };
  if (params.timeoutMs === undefined && provider.timeoutMs !== undefined) {
    params.timeoutMs = provider.timeoutMs;
  }
  const resolved: ResolvedProfile = {
    id: model.id,
    name: model.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: model.model,
  };
  if (Object.keys(params).length > 0) resolved.params = params;
  return resolved;
}

/** A model-less stand-in used for provider probes; listModels ignores `model`. */
export function resolveForProvider(provider: LlmProvider): ResolvedProfile {
  const resolved: ResolvedProfile = {
    id: provider.id,
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: '',
  };
  if (provider.timeoutMs !== undefined) resolved.params = { timeoutMs: provider.timeoutMs };
  return resolved;
}

/**
 * Pure resolution: the feature override if present and still resolvable, otherwise
 * the global default. A model whose provider has gone missing is skipped, not
 * returned half-built. storage/index.ts wraps this with live settings.
 */
export function resolveProfileFrom(
  settings: AppSettings,
  feature: TranslateFeature,
): ResolvedProfile | null {
  for (const id of [settings.defaults[feature], settings.defaults.global]) {
    if (!id) continue;
    const model = settings.models.find((m) => m.id === id);
    if (!model) continue;
    const provider = settings.providers.find((p) => p.id === model.providerId);
    if (!provider) continue;
    return joinProfile(provider, model);
  }
  return null;
}

/** Drop every pointer that no longer names a live model; null out a dead global. */
export function pruneDefaults(defaults: ProfileDefaults, models: ModelProfile[]): ProfileDefaults {
  const alive = (id: string | null | undefined): id is string =>
    !!id && models.some((m) => m.id === id);
  const next: ProfileDefaults = { global: alive(defaults.global) ? defaults.global : null };
  for (const feature of TRANSLATE_FEATURES) {
    if (alive(defaults[feature])) next[feature] = defaults[feature];
  }
  return next;
}

/**
 * Two providers are the same connection only when protocol, baseUrl and apiKey all
 * match. Anything looser could route two accounts through one key (ADR-0007).
 */
const providerKey = (p: LlmProvider) => JSON.stringify([p.protocol, p.baseUrl, p.apiKey]);

/** How many provider rows would disappear if identical ones were merged. */
export function countMergeableProviders(providers: LlmProvider[]): number {
  return providers.length - new Set(providers.map(providerKey)).size;
}

/**
 * Keep the first provider of each identical group and repoint every model at it.
 * Returns the same object when nothing merges, so callers can skip a write.
 * A differing `timeoutMs` is not part of the key: the kept provider's value wins.
 */
export function mergeDuplicateProviders(settings: AppSettings): AppSettings {
  const keptByKey = new Map<string, string>();
  const remap = new Map<string, string>();
  const providers: LlmProvider[] = [];
  for (const provider of settings.providers) {
    const key = providerKey(provider);
    const kept = keptByKey.get(key);
    if (kept) {
      remap.set(provider.id, kept);
      continue;
    }
    keptByKey.set(key, provider.id);
    providers.push(provider);
  }
  if (remap.size === 0) return settings;
  const models = settings.models.map((m) =>
    remap.has(m.providerId) ? { ...m, providerId: remap.get(m.providerId) as string } : m,
  );
  return { ...settings, providers, models };
}
```

记得从 `@/llm/types` 一并 import `ModelParams`。

- [ ] **Step 4: 校验并提交**

Run: `pnpm test tests/storage/schema.test.ts`
Expected: PASS。此时 `pnpm typecheck` 仍会在其他文件报错(T2-T7 陆续修好),本步只保证本任务的测试通过。

```bash
pnpm format && git add src/llm/types.ts src/storage/schema.ts tests/storage/schema.test.ts
git commit -m "feat(storage): split ProviderProfile into LlmProvider and ModelProfile"
```

---

### Task 2: v1 → v2 迁移与读路径接线

**Files:**
- Create: `src/storage/migrate.ts`
- Modify: `src/storage/index.ts`
- Test: `tests/storage/migrate.test.ts`(新增)、`tests/storage/storage.test.ts`

**Interfaces:**
- Consumes: T1 的 `AppSettings`、`DEFAULT_SETTINGS`
- Produces: `isRecord`、`migrateSettings(raw: unknown): AppSettings`

- [ ] **Step 1: 写失败测试**

新建 `tests/storage/migrate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { migrateSettings } from '@/storage/migrate';
import { DEFAULT_SETTINGS } from '@/storage/schema';

const v1 = {
  version: 1,
  providers: [
    {
      id: 'old-a',
      name: 'Gateway / fast',
      protocol: 'openai',
      baseUrl: 'https://gw.example.com/v1',
      apiKey: 'sk-1',
      model: 'gpt-4o-mini',
      params: { temperature: 0.2, timeoutMs: 30_000 },
    },
    {
      id: 'old-b',
      name: 'Gateway / strong',
      protocol: 'openai',
      baseUrl: 'https://gw.example.com/v1',
      apiKey: 'sk-1',
      model: 'gpt-4o',
    },
  ],
  defaults: { global: 'old-a', image: 'old-b' },
  general: { targetLang: 'ja', selectionTrigger: 'instant', pageMode: 'replace', uiLang: 'en' },
  siteRules: { autoTranslate: ['a.com'], disableSelection: [] },
  prompts: { pageBatch: 'custom' },
};

describe('migrateSettings', () => {
  it('splits every v1 profile 1:1 without deduping providers', () => {
    const next = migrateSettings(v1);
    expect(next.version).toBe(2);
    expect(next.providers).toHaveLength(2);
    expect(next.models).toHaveLength(2);
    expect(next.providers[0]).toMatchObject({
      protocol: 'openai',
      baseUrl: 'https://gw.example.com/v1',
      apiKey: 'sk-1',
    });
    expect(next.providers[0]).not.toHaveProperty('model');
  });

  it('keeps the old profile id on the model so defaults still resolve', () => {
    const next = migrateSettings(v1);
    expect(next.models.map((m) => m.id)).toEqual(['old-a', 'old-b']);
    expect(next.defaults).toEqual({ global: 'old-a', image: 'old-b' });
  });

  it('links each model to the provider built from the same profile', () => {
    const next = migrateSettings(v1);
    expect(next.models[0].providerId).toBe(next.providers[0].id);
    expect(next.models[1].providerId).toBe(next.providers[1].id);
    expect(next.models[0].providerId).not.toBe(next.models[1].providerId);
  });

  it('moves params onto the model', () => {
    expect(migrateSettings(v1).models[0].params).toEqual({ temperature: 0.2, timeoutMs: 30_000 });
    expect(migrateSettings(v1).models[1].params).toBeUndefined();
  });

  it('carries general, siteRules and prompts through untouched', () => {
    const next = migrateSettings(v1);
    expect(next.general.targetLang).toBe('ja');
    expect(next.siteRules.autoTranslate).toEqual(['a.com']);
    expect(next.prompts.pageBatch).toBe('custom');
  });

  it('returns v2 input by identity so callers can skip a write-back', () => {
    expect(migrateSettings(DEFAULT_SETTINGS)).toBe(DEFAULT_SETTINGS);
  });

  it('is idempotent', () => {
    const once = migrateSettings(v1);
    expect(migrateSettings(once)).toBe(once);
  });

  it('falls back to defaults for junk input', () => {
    expect(migrateSettings(null)).toBe(DEFAULT_SETTINGS);
    expect(migrateSettings('nope')).toBe(DEFAULT_SETTINGS);
  });

  it('treats a versionless object as v1', () => {
    expect(migrateSettings({ providers: [v1.providers[0]] }).version).toBe(2);
  });

  it('skips profiles with no usable id', () => {
    expect(migrateSettings({ version: 1, providers: [{ baseUrl: 'x' }] }).models).toHaveLength(0);
  });
});
```

`tests/storage/storage.test.ts` 里追加:

```ts
  it('migrates a stored v1 payload on read and writes it back once', async () => {
    await fakeBrowser.storage.local.set({ settings: v1Payload });
    const first = await getSettings();
    expect(first.version).toBe(2);
    expect(first.models).toHaveLength(1);

    const stored = (await fakeBrowser.storage.local.get('settings')).settings as { version: number };
    expect(stored.version).toBe(2);
  });

  it('resolves a feature through the migrated v1 payload', async () => {
    await fakeBrowser.storage.local.set({ settings: v1Payload });
    expect((await resolveProfile('selection'))?.model).toBe('gpt-4o-mini');
  });
```

(`v1Payload` 复用上面的 `v1` 形状,`defaults: { global: 'old-a' }`。同时把该文件原有 `p()` fixture 改成 provider/model 双件。)

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/storage/`
Expected: FAIL,`@/storage/migrate` 不存在。

- [ ] **Step 3: 实现**

`src/storage/migrate.ts`:

```ts
import type { LlmProvider, ModelParams, ModelProfile, Protocol } from '@/llm/types';
import { type AppSettings, DEFAULT_SETTINGS } from './schema';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

function toParams(value: unknown): ModelParams | undefined {
  if (!isRecord(value)) return undefined;
  const params: ModelParams = {};
  if (typeof value.temperature === 'number') params.temperature = value.temperature;
  if (typeof value.maxTokens === 'number') params.maxTokens = value.maxTokens;
  if (typeof value.timeoutMs === 'number') params.timeoutMs = value.timeoutMs;
  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * v1 → v2. Every flat profile becomes exactly one LlmProvider plus one ModelProfile,
 * with no dedupe at all: merging two providers that share a baseUrl but not an account
 * would silently bill the wrong key, so the settings page asks the user instead (ADR-0007).
 * The ModelProfile keeps the v1 profile id, which is why `defaults` needs no remapping.
 */
function migrateV1(raw: Record<string, unknown>): AppSettings {
  const providers: LlmProvider[] = [];
  const models: ModelProfile[] = [];

  for (const entry of Array.isArray(raw.providers) ? raw.providers : []) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '') continue;
    const providerId = crypto.randomUUID();
    const name = str(entry.name);
    providers.push({
      id: providerId,
      name,
      protocol: (entry.protocol === 'anthropic' ? 'anthropic' : 'openai') as Protocol,
      baseUrl: str(entry.baseUrl),
      apiKey: str(entry.apiKey),
    });
    const params = toParams(entry.params);
    models.push({
      id: entry.id,
      name,
      providerId,
      model: str(entry.model),
      ...(params ? { params } : {}),
    });
  }

  return {
    ...DEFAULT_SETTINGS,
    version: 2,
    providers,
    models,
    defaults: isRecord(raw.defaults)
      ? (raw.defaults as AppSettings['defaults'])
      : DEFAULT_SETTINGS.defaults,
    general: isRecord(raw.general)
      ? { ...DEFAULT_SETTINGS.general, ...(raw.general as object) }
      : DEFAULT_SETTINGS.general,
    siteRules: isRecord(raw.siteRules)
      ? { ...DEFAULT_SETTINGS.siteRules, ...(raw.siteRules as object) }
      : DEFAULT_SETTINGS.siteRules,
    prompts: isRecord(raw.prompts) ? (raw.prompts as AppSettings['prompts']) : {},
  };
}

/**
 * Bring any stored or imported payload up to v2. Returns the input **by identity**
 * when it is already v2, so callers can skip a pointless storage write.
 * Shape validation is not this function's job: `normalizeSettings` does that for
 * untrusted files, and stored data was written by a previous version of this app.
 */
export function migrateSettings(raw: unknown): AppSettings {
  if (!isRecord(raw)) return DEFAULT_SETTINGS;
  if (raw.version === 2) return raw as unknown as AppSettings;
  return migrateV1(raw);
}
```

`src/storage/index.ts`:

```ts
import { storage } from '#imports';
import type { ResolvedProfile } from '@/llm/types';
import { migrateSettings } from './migrate';
import { type AppSettings, DEFAULT_SETTINGS, resolveProfileFrom, type TranslateFeature } from './schema';

// All settings live in a single local-only item (ADR-0002). Keys are never synced.
// The stored payload may predate the current schema, so it is typed `unknown` and
// passed through migrateSettings on every read (ADR-0007).
const settingsItem = storage.defineItem<unknown>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function getSettings(): Promise<AppSettings> {
  const stored = await settingsItem.getValue();
  const migrated = migrateSettings(stored);
  // Identity, not deep equality: migrateSettings hands v2 payloads straight back,
  // so this writes exactly once per upgrade instead of on every read.
  if (migrated !== stored) await settingsItem.setValue(migrated);
  return migrated;
}

/** Shallow-merge a patch over the current settings (top-level keys replace). */
export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await settingsItem.setValue({ ...current, ...patch });
}

/** Replace the whole settings object (used by import). */
export async function replaceSettings(next: AppSettings): Promise<void> {
  await settingsItem.setValue(next);
}

export function watchSettings(cb: (settings: AppSettings) => void): () => void {
  return settingsItem.watch((next) => cb(migrateSettings(next ?? DEFAULT_SETTINGS)));
}

export async function resolveProfile(feature: TranslateFeature): Promise<ResolvedProfile | null> {
  return resolveProfileFrom(await getSettings(), feature);
}

// imageNoticeItem 部分原样保留。
```

- [ ] **Step 4: 校验并提交**

Run: `pnpm test tests/storage/`
Expected: PASS。

```bash
pnpm format && git add src/storage/migrate.ts src/storage/index.ts tests/storage/migrate.test.ts tests/storage/storage.test.ts
git commit -m "feat(storage): migrate v1 settings to the provider/model split on read"
```

---

### Task 3: 导入导出的版本分派与校验

**Files:**
- Modify: `src/storage/import-export.ts`
- Test: `tests/storage/storage.test.ts`

**Interfaces:**
- Consumes: T1 的类型与 `pruneDefaults` / `TRANSLATE_FEATURES`、T2 的 `isRecord` / `migrateSettings`
- Produces: 无新导出(`exportSettings` / `importSettings` / `normalizeSettings` 签名不变)

- [ ] **Step 1: 写失败测试**

`tests/storage/storage.test.ts` 的 import/export 段追加:

```ts
  it('imports a v1 file exported by an older build', async () => {
    await importSettings(JSON.stringify(v1Payload));
    const s = await getSettings();
    expect(s.version).toBe(2);
    expect(s.providers).toHaveLength(1);
    expect(s.models[0].model).toBe('gpt-4o-mini');
    expect(s.defaults.global).toBe('old-a');
  });

  it('keeps the image feature override through a round-trip', async () => {
    await replaceSettings(withImageOverride);
    const json = exportSettings(await getSettings(), true);
    await importSettings(json);
    expect((await getSettings()).defaults.image).toBe('m2');
  });

  it('strips api keys from providers but leaves models alone', async () => {
    const json = JSON.parse(exportSettings(withImageOverride, false));
    expect(json.providers.every((p: { apiKey: string }) => p.apiKey === '')).toBe(true);
    expect(json.models[0].model).toBe('gpt-4o-mini');
  });

  it('re-imports a key-stripped export', async () => {
    await importSettings(exportSettings(withImageOverride, false));
    expect((await getSettings()).providers[0].apiKey).toBe('');
  });

  it('rejects a model that references a provider not in the file', async () => {
    const broken = { ...withImageOverride, models: [{ ...withImageOverride.models[0], providerId: 'ghost' }] };
    await expect(importSettings(JSON.stringify(broken))).rejects.toThrow(/provider/i);
  });

  it('drops a default pointing at a model that is not in the file', async () => {
    const broken = { ...withImageOverride, defaults: { global: 'm1', image: 'ghost' } };
    await importSettings(JSON.stringify(broken));
    expect((await getSettings()).defaults.image).toBeUndefined();
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/storage/storage.test.ts`
Expected: FAIL,当前 `normalizeSettings` 不认 `models`,也不读 `defaults.image`。

- [ ] **Step 3: 实现**

`src/storage/import-export.ts` 关键改动:

```ts
import type { LlmProvider, ModelParams, ModelProfile, Protocol } from '@/llm/types';
import { replaceSettings } from './index';
import { isRecord, migrateSettings } from './migrate';
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  type PageMode,
  pruneDefaults,
  type SelectionTrigger,
  TRANSLATE_FEATURES,
  type UiLang,
} from './schema';

/** Serialize settings to pretty JSON; API keys are stripped unless requested. */
export function exportSettings(settings: AppSettings, includeKeys: boolean): string {
  const providers = includeKeys
    ? settings.providers
    : settings.providers.map((provider) => ({ ...provider, apiKey: '' }));
  return JSON.stringify({ ...settings, providers }, null, 2);
}
```

`normalizeProfile` 拆成两个:

```ts
function requireStrings(value: Record<string, unknown>, keys: readonly string[], what: string) {
  for (const key of keys) {
    if (typeof value[key] !== 'string' || (value[key] as string).length === 0) {
      throw new Error(`${what} field "${key}" must be a non-empty string`);
    }
  }
}

function normalizeProvider(value: unknown): LlmProvider {
  if (!isRecord(value)) throw new Error('Each provider must be an object');
  const { protocol } = value;
  if (typeof protocol !== 'string' || !PROTOCOLS.includes(protocol as Protocol)) {
    throw new Error(`Invalid provider protocol: ${String(protocol)}`);
  }
  requireStrings(value, ['id', 'baseUrl'], 'Provider');

  const provider: LlmProvider = {
    id: value.id as string,
    name: typeof value.name === 'string' ? value.name : '',
    protocol: protocol as Protocol,
    baseUrl: value.baseUrl as string,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
  };
  if (typeof value.timeoutMs === 'number') provider.timeoutMs = value.timeoutMs;
  return provider;
}

function normalizeModel(value: unknown, providerIds: ReadonlySet<string>): ModelProfile {
  if (!isRecord(value)) throw new Error('Each model must be an object');
  requireStrings(value, ['id', 'providerId', 'model'], 'Model');
  if (!providerIds.has(value.providerId as string)) {
    throw new Error(`Model "${value.id}" references a provider that is not in this file`);
  }

  const profile: ModelProfile = {
    id: value.id as string,
    name: typeof value.name === 'string' ? value.name : '',
    providerId: value.providerId as string,
    model: value.model as string,
  };
  if (isRecord(value.params)) {
    const params: ModelParams = {};
    if (typeof value.params.temperature === 'number') params.temperature = value.params.temperature;
    if (typeof value.params.maxTokens === 'number') params.maxTokens = value.params.maxTokens;
    if (typeof value.params.timeoutMs === 'number') params.timeoutMs = value.params.timeoutMs;
    if (Object.keys(params).length > 0) profile.params = params;
  }
  return profile;
}
```

`normalizeSettings` 头尾改动:

```ts
/** Validate untrusted imported data and fold it over the defaults. */
export function normalizeSettings(parsed: unknown): AppSettings {
  if (!isRecord(parsed)) throw new Error('Settings must be an object');
  // An older export is a v1 payload: lift it first, then validate the v2 shape.
  const source: Record<string, unknown> =
    parsed.version === 2 ? parsed : (migrateSettings(parsed) as unknown as Record<string, unknown>);

  const providers = Array.isArray(source.providers) ? source.providers.map(normalizeProvider) : [];
  const providerIds = new Set(providers.map((p) => p.id));
  const models = Array.isArray(source.models)
    ? source.models.map((m) => normalizeModel(m, providerIds))
    : [];

  const defaultsRaw = isRecord(source.defaults) ? source.defaults : {};
  const defaults: AppSettings['defaults'] = {
    global: typeof defaultsRaw.global === 'string' ? defaultsRaw.global : null,
  };
  for (const feature of TRANSLATE_FEATURES) {
    if (typeof defaultsRaw[feature] === 'string') defaults[feature] = defaultsRaw[feature] as string;
  }

  // ...general / siteRules / prompts 三段原样保留...

  return {
    version: 2,
    providers,
    models,
    // Anything pointing at a model this file does not contain is dropped, so an
    // imported file can never leave routing half-broken.
    defaults: pruneDefaults(defaults, models),
    general,
    siteRules,
    prompts,
  };
}
```

同时删掉本文件里私有的 `isRecord`(改从 `./migrate` 导入),`toStringArray` 保留。

- [ ] **Step 4: 校验并提交**

Run: `pnpm test tests/storage/`
Expected: PASS。

```bash
pnpm format && git add src/storage/import-export.ts tests/storage/storage.test.ts
git commit -m "fix(storage): version-aware import, and stop dropping the image override"
```

---

### Task 4: llm 层类型重命名,并让 listModels 抛出真实错误

**Files:**
- Modify: `src/llm/types.ts`、`src/llm/client.ts`、`src/llm/openai.ts`、`src/llm/anthropic.ts`
- Test: `tests/llm/client.test.ts`、`tests/llm/openai.test.ts`、`tests/llm/anthropic.test.ts`

**Interfaces:**
- Consumes: T1 的 `ResolvedProfile`
- Produces: 无新导出。`TranslationClient.listModels` 的契约从「永不抛」改为「失败即抛 `LlmError`」

- [ ] **Step 1: 写失败测试**

`tests/llm/client.test.ts` 里,把现有那条断言 listModels 吞异常的用例改掉(它现在断言的是我们要删除的行为),并追加:

```ts
describe('createClient.listModels', () => {
  it('returns the model ids on success', async () => {
    const fetchImpl = recordingFetch(() => jsonResponse({ data: [{ id: 'gpt-4o-mini' }] }));
    expect(await createClient(profile, { fetchImpl }).listModels()).toEqual(['gpt-4o-mini']);
  });

  it('returns an empty array when the endpoint genuinely has no models', async () => {
    const fetchImpl = recordingFetch(() => jsonResponse({ data: [] }));
    expect(await createClient(profile, { fetchImpl }).listModels()).toEqual([]);
  });

  it('throws on an auth failure instead of pretending there are no models', async () => {
    const fetchImpl = recordingFetch(() => new Response('nope', { status: 401 }));
    const client = createClient(profile, { fetchImpl, maxRetries: 0 });
    await expect(client.listModels()).rejects.toBeInstanceOf(LlmError);
  });

  it('throws on a gateway error too', async () => {
    const fetchImpl = recordingFetch(() => new Response('boom', { status: 500 }));
    const client = createClient(profile, { fetchImpl, maxRetries: 0 });
    await expect(client.listModels()).rejects.toBeInstanceOf(LlmError);
  });
});
```

(`jsonResponse` 若 `tests/helpers.ts` 里没有就顺手加一个:`new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })`。)

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/llm/`
Expected: FAIL,后两条报 `resolved instead of rejected`,因为 `client.ts` 目前把异常吃掉换成了 `[]`。

- [ ] **Step 3: 实现**

先做机械重命名:全仓 `ProviderProfile` → `ResolvedProfile`(`src/llm/openai.ts`、`src/llm/anthropic.ts`、`src/llm/client.ts`、`src/llm/http.ts` 如有、以及 `tests/llm/*.test.ts` 的 fixture 类型标注)。**只改类型名和 import,不改任何逻辑**,`profile.model` / `profile.params` 的读取全部原样。

然后删掉 `src/llm/client.ts` 里 `listModels` 的整个包装:

```ts
    // 删除这一段
    async listModels(): Promise<string[]> {
      try {
        return await adapter.listModels();
      } catch {
        return [];
      }
    },
```

换成直接透传:

```ts
    // An empty array means the endpoint really has no models. Auth failures and
    // gateway errors throw, so the settings page can show what actually went wrong
    // instead of "no models returned, type the name yourself" (ADR-0007).
    listModels: () => adapter.listModels(),
```

同时把 `createClient` 上方的 doc comment 里「makes listModels non-throwing」那句删掉。两个 adapter 的 `testConnection` 保持原样,它就是 model 级探测。

- [ ] **Step 4: 校验并提交**

Run: `pnpm test tests/llm/`
Expected: PASS。

```bash
pnpm format && git add src/llm tests/llm
git commit -m "refactor(llm): rename ProviderProfile to ResolvedProfile and stop swallowing listModels errors"
```

---

### Task 5: RPC 协议与 background handler

**Files:**
- Modify: `src/messaging/protocol.ts`、`src/messaging/handler.ts`
- Test: `tests/messaging/handler.test.ts`

**Interfaces:**
- Consumes: T1 的 `resolveForProvider` / `joinProfile`、T4 的会抛异常的 `listModels`
- Produces: `BgRequest` 三个新分支(`list-models` 改字段、`test-provider`、`test-model`)

- [ ] **Step 1: 写失败测试**

`tests/messaging/handler.test.ts` 的 fixture 改成 provider/model 双件,并追加:

```ts
  it('lists models for a provider without needing a model profile', async () => {
    const events = await run({ kind: 'list-models', providerId: 'p1' });
    expect(events).toContainEqual({ type: 'models', models: ['a', 'b'] });
  });

  it('errors when the provider id is unknown', async () => {
    const events = await run({ kind: 'list-models', providerId: 'ghost' });
    expect(events[0]).toMatchObject({ type: 'error', code: 'not_found' });
  });

  it('reports a listModels failure as an error event, not an empty list', async () => {
    spy.listModels.mockRejectedValueOnce(new LlmError('auth', 'Invalid API key'));
    const events = await run({ kind: 'list-models', providerId: 'p1' });
    expect(events[0]).toMatchObject({ type: 'error', code: 'auth' });
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'models' }));
  });

  it('probes a provider through listModels, never through a completion', async () => {
    const events = await run({ kind: 'test-provider', providerId: 'p1' });
    expect(spy.listModels).toHaveBeenCalled();
    expect(spy.testConnection).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ type: 'test-result', ok: true });
  });

  it('turns a provider probe failure into a test-result, not an error event', async () => {
    spy.listModels.mockRejectedValueOnce(new LlmError('auth', 'Invalid API key'));
    const events = await run({ kind: 'test-provider', providerId: 'p1' });
    expect(events[0]).toMatchObject({ type: 'test-result', ok: false, errorCode: 'auth' });
  });

  it('probes a model through testConnection with the joined profile', async () => {
    await run({ kind: 'test-model', modelId: 'm1' });
    expect(spy.testConnection).toHaveBeenCalled();
    expect(spy.lastProfile).toMatchObject({ model: 'gpt-4o-mini', apiKey: 'sk' });
  });

  it('errors when a model points at a provider that is gone', async () => {
    const events = await run({ kind: 'test-model', modelId: 'orphan' });
    expect(events[0]).toMatchObject({ type: 'error', code: 'not_found' });
  });
```

注意上面第三条和第五条的对照:同一个 `LlmError`,两条 RPC 给出两种语义。`list-models` 失败走 `{ type: 'error' }`,因为用户是想拿一份列表而没拿到,这是一次操作失败;`test-provider` 失败走 `{ type: 'test-result', ok: false }`,因为用户就是来问「这条连接行不行」的,「不行」是一个正常的回答而不是一次失败。别把两者合并成一种事件。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/messaging/`
Expected: FAIL,`test-provider` / `test-model` 不在 `BgRequest` 上。

- [ ] **Step 3: 实现**

`src/messaging/protocol.ts`:把最后两个 `BgRequest` 分支换成三条,并更新顶部注释里的枚举描述:

```ts
  | { kind: 'list-models'; providerId: string }
  /** Connection health only: auth + reachability, no model involved. */
  | { kind: 'test-provider'; providerId: string }
  /** End-to-end check for one Model Profile: a single tiny completion. */
  | { kind: 'test-model'; modelId: string };
```

`src/messaging/handler.ts`:`HandlerDeps` 里 `resolveProfile` / `createClient` 的类型签名跟着 `ResolvedProfile` 改名;末尾三个 case 重写:

```ts
      case 'list-models': {
        const settings = await deps.getSettings();
        const provider = settings.providers.find((p) => p.id === req.providerId);
        if (!provider) {
          emit({ type: 'error', code: 'not_found', message: 'Provider not found' });
          return;
        }
        // No local catch: a failure here is an operation failure, so the outer
        // handler turns it into { type: 'error' } with the real code and message.
        const models = await deps.createClient(resolveForProvider(provider)).listModels();
        emit({ type: 'models', models });
        return;
      }
      case 'test-provider': {
        const settings = await deps.getSettings();
        const provider = settings.providers.find((p) => p.id === req.providerId);
        if (!provider) {
          emit({ type: 'error', code: 'not_found', message: 'Provider not found' });
          return;
        }
        // Connection probe: the same failure is a verdict here, not an operation
        // error, so it is caught locally and reported as a test-result.
        const start = Date.now();
        try {
          await deps.createClient(resolveForProvider(provider)).listModels();
          emitTestResult({ ok: true, latencyMs: Date.now() - start });
        } catch (error) {
          emitTestResult({
            ok: false,
            error: error instanceof LlmError ? error : new LlmError('network', String(error)),
          });
        }
        return;
      }
      case 'test-model': {
        const settings = await deps.getSettings();
        const model = settings.models.find((m) => m.id === req.modelId);
        const provider = model && settings.providers.find((p) => p.id === model.providerId);
        if (!model || !provider) {
          emit({ type: 'error', code: 'not_found', message: 'Model or its provider not found' });
          return;
        }
        emitTestResult(await deps.createClient(joinProfile(provider, model)).testConnection());
        return;
      }
```

`emitTestResult` 是本文件内的小助手,把两个分支里重复的六行 emit 收成一处:

```ts
    const emitTestResult = (result: TestResult) =>
      emit({
        type: 'test-result',
        ok: result.ok,
        latencyMs: result.latencyMs,
        errorCode: result.error?.code,
        message: result.error?.message,
      });
```

`LlmError` 和 `TestResult` 从 `@/llm/types` import。`translate-stream` / `translate-batch` / `translate-image` 三个分支一行不改。

- [ ] **Step 4: 校验并提交**

Run: `pnpm test tests/messaging/`
Expected: PASS。

```bash
pnpm format && git add src/messaging tests/messaging
git commit -m "feat(messaging): split test-connection into test-provider and test-model"
```

---

### Task 6: 设置页两个 section 与合并横幅

**Files:**
- Modify: `src/entrypoints/options/ProviderCard.tsx`、`src/entrypoints/options/App.tsx`、`src/entrypoints/options/style.css`
- Create: `src/entrypoints/options/ModelCard.tsx`、`src/entrypoints/options/MergeProvidersBanner.tsx`

**Interfaces:**
- Consumes: T1 的纯函数、T5 的 RPC
- Produces: 无(UI 终点)

- [ ] **Step 1: 瘦身 ProviderCard**

删掉 model 字段、Fetch models 按钮、datalist、`advanced` 折叠块(temperature / maxTokens)、`PLACEHOLDERS[protocol].model`。保留 name、protocol segmented、baseUrl、apiKey(含显示/隐藏)。

- `handleTest` 改发 `{ kind: 'test-provider', providerId: profile.id }`,按钮文案换 `actionTestProvider`。
- Props 加 `inUseCount: number`。删除按钮在 `inUseCount > 0` 时 `disabled`,并在 `title` 上挂 `t('providerInUseHint', { count: inUseCount })`。
- `isGlobalDefault` badge 移到 ModelCard,Props 去掉这个字段。

- [ ] **Step 2: 新建 ModelCard**

结构照搬瘦身前的 ProviderCard,字段换成:

- name 输入(placeholder `modelNamePlaceholder`),`isGlobalDefault` 时显示 `providerUsing` badge。
- provider `<select>`(label `fieldProvider`),选项来自 `providers`,显示名走 `p.name || t('providerNamePlaceholder')`。provider 列表为空时整卡片给一条 `modelNeedsProvider` 提示并禁用其余控件。
- model 输入 + Fetch models 按钮,RPC 改发 `{ kind: 'list-models', providerId: profile.providerId }`;切换 provider 时清空 `models` 本地 state(旧列表属于旧连接,留着会误导)。placeholder 取所选 provider 的 `PLACEHOLDERS[provider.protocol].model`。
- **Fetch models 的失败必须显示真实原因**。旧代码把任何失败都变成 `setModels([])`,界面于是显示「未返回模型,请手动填写模型名」,Key 填错时用户会真的去手填。T4 之后 `listModels` 会抛,handler 会 emit `{ type: 'error', message }`,所以本地 state 改成:

```ts
  const [models, setModels] = useState<string[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function handleFetchModels() {
    setFetchingModels(true);
    setFetchError(null);
    try {
      const ev = await runRpc({ kind: 'list-models', providerId: profile.providerId });
      if (ev.type === 'models') setModels(ev.models);
      else setFetchError(ev.type === 'error' ? ev.message : 'Unexpected response');
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed');
    } finally {
      setFetchingModels(false);
    }
  }
```

  hint 区域三态:`fetchError` 非空时用 `status--error` 显示它(和 Test model 的错误展示一致,直接显示 message,不需要新 i18n key);否则沿用 `modelsAvailable` / `modelsNone`。`modelsNone` 现在只在真的返回空列表时出现,文案含义才成立。
- `advanced` 折叠块原样搬过来(temperature / maxTokens),`patchParam` 逻辑不变。maxTokens 的 placeholder 判断从 `profile.protocol` 改成所选 provider 的 protocol。
- Test model 按钮发 `{ kind: 'test-model', modelId: profile.id }`,文案 `actionTestModel`。
- Delete 按钮走 `confirmDeleteModel`。

- [ ] **Step 3: 新建 MergeProvidersBanner**

```tsx
interface Props {
  count: number;
  onMerge: () => void;
}

export function MergeProvidersBanner({ count, onMerge }: Props) {
  const t = useT();
  if (count === 0) return null;
  return (
    <div className="merge-banner" role="status">
      <span className="merge-banner__text">{t('mergeBannerText', { count })}</span>
      <button type="button" className="btn btn--primary" onClick={onMerge}>
        {t('mergeBannerAction')}
      </button>
    </div>
  );
}
```

`style.css` 里加 `.merge-banner` / `.merge-banner__text`,配色和间距对齐 `src/ui/permission-banner.css` 的 `.perm-banner`。横幅无需持久化「已忽略」状态:`countMergeableProviders` 归零后它自己消失,用户不想合并就不点。

- [ ] **Step 4: App.tsx 接线**

```ts
const SECTIONS = [
  { id: 'providers', key: 'navProviders' },
  { id: 'models', key: 'navModels' },
  { id: 'routing', key: 'navRouting' },
  // ...其余不变
] as const satisfies ReadonlyArray<{ id: string; key: MessageKey }>;

function newProvider(): LlmProvider {
  return { id: crypto.randomUUID(), name: '', protocol: 'openai', baseUrl: '', apiKey: '' };
}

function newModel(providerId: string): ModelProfile {
  return { id: crypto.randomUUID(), name: '', providerId, model: '' };
}

const addProvider = () => mutate((s) => ({ ...s, providers: [...s.providers, newProvider()] }));

const addModel = () =>
  mutate((s) => {
    const providerId = s.providers[0]?.id;
    if (!providerId) return s;
    const profile = newModel(providerId);
    return {
      ...s,
      models: [...s.models, profile],
      // First model ever created becomes the global default, matching the old behaviour
      // where the first provider did.
      defaults: s.models.length === 0 ? { ...s.defaults, global: profile.id } : s.defaults,
    };
  });

const deleteModel = (id: string) => {
  if (!confirm(t('confirmDeleteModel'))) return;
  mutate((s) => {
    const models = s.models.filter((m) => m.id !== id);
    const pruned = pruneDefaults(s.defaults, models);
    return { ...s, models, defaults: { ...pruned, global: pruned.global ?? (models[0]?.id ?? null) } };
  });
};

const deleteProvider = (id: string) => {
  if (!confirm(t('confirmDeleteProvider'))) return;
  // The button is disabled while models still reference it, so this only ever
  // removes an unused connection and cannot orphan anything.
  mutate((s) => ({ ...s, providers: s.providers.filter((p) => p.id !== id) }));
};

const mergeProviders = () => mutate(mergeDuplicateProviders);
```

`providers` section:横幅在卡片列表上方,`Add provider` 按钮不变,空态文案 `providersEmptyBody` 改写。每张卡片传 `inUseCount={models.filter((m) => m.providerId === profile.id).length}`。

`models` section:`Add model` 按钮在 `providers.length === 0` 时禁用,空态分两种:没有 provider 时提示先去 Providers,有 provider 时是 `modelsEmptyTitle` / `modelsAddFirst`。

`patchProvider` / `patchModel` 两个 map 更新照抄现有 `patchProvider` 写法。

- [ ] **Step 5: 校验并提交**

Run: `pnpm typecheck && pnpm lint`
Expected: 除 T7 的 i18n key 缺失外无其他报错(两个任务合并跑通也可以,顺序做完 T7 再一起验)。

```bash
pnpm format && git add src/entrypoints/options
git commit -m "feat(options): separate LLM Provider and Model Profile sections"
```

---

### Task 7: 路由面板与双语文案

**Files:**
- Modify: `src/entrypoints/options/DefaultsPanel.tsx`、`src/i18n/messages.ts`

- [ ] **Step 1: DefaultsPanel 换数据源**

Props 从 `providers: ProviderProfile[]` 换成 `models: ModelProfile[]`,四个 `<select>` 的选项源改成 `models`,显示名 `m.name || t('modelNamePlaceholder')`。其余结构不动。`App.tsx` 传参跟着改。

- [ ] **Step 2: i18n 新增与改写(EN 为 source of truth,ZH 同 key)**

新增:

```ts
  navModels: 'Models',

  // Models
  modelsAdd: 'Add model',
  modelsEmptyTitle: 'No models yet',
  modelsEmptyBody:
    'A model picks one model name on one of your providers. Add several to switch models without retyping the endpoint.',
  modelsAddFirst: 'Add your first model',
  modelsNeedProviderTitle: 'Add a provider first',
  modelsNeedProviderBody: 'A model has to sit on a provider. Set up the endpoint and key first.',
  confirmDeleteModel: 'Delete this model? This cannot be undone.',
  modelNamePlaceholder: 'Untitled model',
  modelNameAria: 'Model name',
  fieldProvider: 'Provider',
  actionTestProvider: 'Test connection',
  actionTestModel: 'Test model',
  providerInUseHint: '{count} models use this provider. Delete or move them first.',
  mergeBannerText: '{count} providers duplicate another one exactly. Merge them into one?',
  mergeBannerAction: 'Merge duplicates',
```

对应 ZH:

```ts
  navModels: '模型',

  modelsAdd: '添加模型',
  modelsEmptyTitle: '还没有模型',
  modelsEmptyBody: '一条模型配置 = 在某个 Provider 上选一个模型名。多加几条,换模型时就不用重填接口地址了。',
  modelsAddFirst: '添加第一个模型',
  modelsNeedProviderTitle: '请先添加 Provider',
  modelsNeedProviderBody: '模型必须挂在某个 Provider 上,先把接口地址和 Key 配好。',
  confirmDeleteModel: '删除这条模型配置?此操作不可撤销。',
  modelNamePlaceholder: '未命名模型',
  modelNameAria: '模型名称',
  fieldProvider: 'Provider',
  actionTestProvider: '测试连接',
  actionTestModel: '测试模型',
  providerInUseHint: '还有 {count} 条模型配置在用这个 Provider,请先删除或改绑。',
  mergeBannerText: '有 {count} 个 Provider 与其他条目完全重复,合并成一个?',
  mergeBannerAction: '合并重复项',
```

删除:`actionTestConnection`(被上面两条取代)。

改写既有文案(语义从「服务商 = 一整套配置」变成「Provider = 一条连接」):

- `navProviders`:EN 保持 `Providers`;ZH 从 `服务商` 改为 `Provider`(CONTEXT.md 的 Avoid 列表禁用「服务商」)。
- `providersEmptyBody`:EN `Add a provider: the endpoint and API key you translate through. Nothing leaves this device except requests to the endpoint you configure.`;ZH `添加一个 Provider,也就是翻译请求发往的接口地址和 API Key。除了发往你配置的接口,数据不会离开本机。`
- `providerNamePlaceholder` / `providerNameAria` / `providersAdd` / `providersEmptyTitle` / `providersAddFirst` / `confirmDeleteProvider`:ZH 里的「服务商」统一替换为「Provider」。
- `routingGlobalDefault` 的 hint `routingGlobalHint` 保持不变(语义仍然成立);`routingNone` / `routingUseGlobal` 不变。
- `fieldModel` 保留(ModelCard 用)。

- [ ] **Step 3: 校验并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全部 PASS(此时整个代码路径应已自洽)。

```bash
pnpm format && git add src/entrypoints/options/DefaultsPanel.tsx src/entrypoints/options/App.tsx src/i18n/messages.ts
git commit -m "feat(options): route features to Model Profiles and update copy"
```

---

### Task 8: e2e、文档同步、全量验证、手工冒烟

**Files:**
- Modify: `e2e/support.ts`、`e2e/retry.spec.ts`(如有 fixture 依赖)
- Modify: `docs/plan.md`、`docs/plan.zh-CN.md`
- Modify: `README.md`、`README.zh-CN.md`(仅当截图或配置说明提到「填 Base URL + Key + 模型」)

- [ ] **Step 1: e2e fixture 升级**

`e2e/support.ts` 的 `seedSettings` 默认值改成 v2:

```ts
  const settings = {
    version: 2,
    providers: [
      { id: 'mock-p', name: 'Mock', protocol: 'openai', baseUrl: `${BASE_URL}/v1`, apiKey: 'test-key' },
    ],
    models: [{ id: 'mock', name: 'Mock', providerId: 'mock-p', model: 'mock-model' }],
    defaults: { global: 'mock' },
    // general / siteRules / prompts 不变
  };
```

`model` id 沿用 `'mock'`,`defaults.global` 因此不用改,依赖它的 spec 也不用改。

- [ ] **Step 2: 补一条 v1 兼容的 e2e**

在合适的 spec 里加一例:用 v1 形状 seed(`version: 1`,扁平 providers),打开设置页,断言 Models section 出现一条记录且划词翻译仍能走通。这是「老用户升级不丢配置」唯一的端到端证据,不能只靠单测。

- [ ] **Step 3: 文档同步**

`docs/plan.md` / `docs/plan.zh-CN.md` 补一节:Provider 与模型配置拆分已落地,引用 ADR-0007,写清 v2 schema 形状与迁移策略。README 里若有「新建 Provider 需填 Base URL / Key / 模型」的说明,改成两步。

- [ ] **Step 4: 全量验证**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm verify:firefox`
Expected: 全部 PASS。

- [ ] **Step 5: 手工冒烟清单(`pnpm dev` 装载后逐项勾)**

升级路径(最关键,先做):

1. 先用 v0.3.0 构建装一次,建 3 条 provider(同一 baseUrl、同一 key、不同模型),把 Feature Override 里截屏翻译指到第 3 条,划词翻译指到第 2 条。
2. 换成本分支构建重载扩展,打开设置页:Providers 3 条、Models 3 条;Routing 三个下拉的选中项与升级前一致;划词、全文、截屏三个功能都能正常翻译。
3. 顶部出现合并横幅提示 2 条重复,点合并:Providers 变 1 条,Models 仍 3 条且都指向它,三个功能仍正常。
4. 导出带 key 的 JSON 再导入,配置完全一致(含截屏翻译的 Feature Override)。
5. 拿一份 v0.3.0 导出的 JSON 导入,不报错,得到拆分后的结果。

新建路径:

6. 全新 profile:先加 Provider 填 Base URL + Key,点 Test connection 得到「已连接」;故意把 Key 改错,再点应报鉴权错误。
7. Models section 点 Add model,provider 下拉自动选中唯一那个,点 Fetch models 出列表,选一个,点 Test model 通过;把模型名改成不存在的,Test model 报错而 Test connection 仍通过。
8. **把 Key 改错后点 Fetch models**:必须显示鉴权失败的真实原因,**不能**显示「未返回模型,请手动填写模型名」。这是 `listModels` 不再吞异常之后最直接的用户可见改善,单独验一遍。
9. 加第 2 条模型,只选 provider 加填模型名,不需要再碰 Base URL 和 Key。
10. 切换某条 model 的 provider,Fetch models 拉到的是新连接的列表。
11. 删掉正在被 Routing 指向的 model:Routing 对应项自动回落,不出现悬空选项。
12. 删一个仍被模型引用的 Provider:按钮禁用,hover 提示还有几条在用;把那些模型改绑到别的 provider 后,删除按钮恢复可用。
13. Firefox(`pnpm dev:firefox`)重跑第 2、6、7、8 项。

- [ ] **Step 6: 提交**

```bash
git add e2e docs/plan.md docs/plan.zh-CN.md README.md README.zh-CN.md
git commit -m "docs: document the provider/model split and cover v1 upgrade in e2e"
```

---

## Self-Review 记录(计划完成时已核对)

- **grill 洞覆盖**:8 个洞各有归属。(1) defaults 指向 model → T1 `resolveProfileFrom` + T7 DefaultsPanel;(2) 运行时不拆 → T1 `ResolvedProfile` + T4 机械重命名;(3) 旧备份导不回 → T2 `migrateSettings` + T3 版本分派 + T8 冒烟第 5 项;(4) 去重规则 → 迁移零去重 + T1 `mergeDuplicateProviders` + T6 横幅;(5) params 归属 → T1 `joinProfile` 的 model 覆盖 provider;(6) 测连接语义 → T4 让 `listModels` 抛 + T5 RPC 拆分与两种失败语义;(7) 删除级联与 image bug → T1 `pruneDefaults` + T3 defaults 循环 + T6 禁用删除;(8) 成功判据 → 下方。
- **评审追加**:`listModels` 吞异常这件事是评审时补上的,不在原始 8 个洞里。它把 401 伪装成空列表,界面因此把用户引向「手填模型名」。T4 删包装、T5 分两种失败语义、T6 三态 hint、T8 第 8 项冒烟,四处闭环。
- **占位符扫描**:无 TBD/TODO。T6 的 UI 步骤是结构描述而非逐行代码,因为它基本是把现有 ProviderCard 的字段搬家,逐行贴反而掩盖了「哪些必须改」;必须改的点(RPC payload、placeholder 取值来源、切 provider 清空模型列表、删除禁用)已逐条列出。
- **类型一致性**:`LlmProvider` / `ModelProfile` / `ResolvedProfile` / `ModelParams`(T1)→ `migrateSettings`(T2)→ `normalizeProvider` / `normalizeModel`(T3)→ `listModels` 的抛出契约(T4)→ `resolveForProvider` / `joinProfile` 在 handler 的用法(T5)已交叉核对。`TranslationClient` 接口未变。`AppSettings.version` 从字面量 1 改为字面量 2,`DEFAULT_SETTINGS` 同步。
- **成功判据**:(a) 任一 v0.3.0 导出的 JSON 能导入;(b) 升级后设置零丢失,含 `defaults.image`;(c) 点一次合并后 provider 条目数明显少于原 profile 数;(d) 新增一个模型的操作从填 4 个字段降到选 1 个下拉加填 1 个模型名;(e) 模型名打错时 Test model 失败而 Test connection 成功;(f) Key 填错时 Fetch models 显示鉴权失败,而不是「未返回模型」。
- **明确不在本计划**(勿实现):provider 之间的模型配置批量复制、provider 级的模型白名单、按 provider 分组展示 Routing 下拉、v2 之后的任何 schema 变动、把 `secondaryTargetLang` 接进 UI。
