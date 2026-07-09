# Firefox (Gecko) 支持实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让扩展以 MV3 形态构建、验证并准备上架 Firefox Add-ons (AMO),配套全渠道权限引导(Permission Onboarding)。

**Architecture:** 决策已在 [ADR-0005](../../adr/0005-firefox-mv3-with-permission-onboarding.md) 定稿:Firefox 与 Chrome/Edge 统一 MV3(需覆盖 WXT 对 firefox 的 MV2 默认),代价是 Firefox 把 `<all_urls>` 当可选权限,因此新增一个 `src/permissions.ts` 权限模块 + onboarding 页 + popup/options 警示条 + background 兜底,同一套代码在 Chrome 下权限恒为已授予、UI 自然不显示(零浏览器探测分支)。已验证:`wxt build -b firefox --mv3` 开箱产出正确的 `background.scripts`(event page)与 `action` 键,manifest 只缺 `browser_specific_settings.gecko`。

**Tech Stack:** WXT 0.20 + React 19 + TypeScript,vitest(单测,`WxtVitest` 插件提供 fakeBrowser),Playwright(既有 Chromium e2e,不动),selenium-webdriver(新增 Firefox e2e,Selenium Manager 自动装 geckodriver),Biome。

## Global Constraints

- 分支:`feat/firefox-support`(已存在);commit 遵循仓库 conventional commits 风格(`feat(scope): …`)。
- Node ≥ 20.19.0,pnpm 9.15.9(`packageManager` 已钉死);所有命令在仓库根目录执行。
- gecko id 恒为 `llm-translate@junrin-lee.github.io`,`strict_min_version` 恒为 `128.0`(ADR-0005,上架后不可变)。
- Firefox 构建一律带 `--mv3`(WXT 对 firefox 默认 MV2)。
- 所有用户可见文案必须走 `src/i18n/messages.ts`(EN 为 source of truth,ZH 同 key,类型强制),不得硬编码;产品名一律 `import { BRAND } from '@/brand'`。
- 不引入浏览器探测(`navigator.userAgent` 等)分支;差异一律通过能力检测(`permissions.contains`)表达。
- 每个任务完成前跑 `pnpm typecheck && pnpm lint && pnpm test` 保持全绿(lint 报格式问题先 `pnpm format`)。
- 用户面文档(README / docs/INSTALL)双语同步更新(`*.zh-CN.md`)。

---

### Task 1: Firefox 构建配置 + manifest 校验脚本

**Files:**
- Create: `scripts/verify-firefox-manifest.mjs`
- Modify: `wxt.config.ts`(26–50 行的 `manifest` 对象改为函数)
- Modify: `package.json`(scripts 区,`"zip:edge"` 之后)

**Interfaces:**
- Consumes: 无(首任务)。
- Produces: `pnpm build:firefox` / `pnpm zip:firefox` / `pnpm dev:firefox` / `pnpm verify:firefox` 四个脚本;`.output/firefox-mv3/` 产物目录。Task 4 会向 `scripts/verify-firefox-manifest.mjs` 追加断言,Task 7 依赖 `zip:firefox`。

- [ ] **Step 1: 写校验脚本(此刻必然失败,充当本任务的失败测试)**

创建 `scripts/verify-firefox-manifest.mjs`:

```js
// Asserts the Firefox build artifact matches ADR-0005. Run after `wxt build -b firefox --mv3`.
import { readFileSync } from 'node:fs';

const OUT = new URL('../.output/firefox-mv3/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', OUT), 'utf8'));

const failures = [];
const expect = (cond, msg) => {
  if (!cond) failures.push(msg);
};

expect(manifest.manifest_version === 3, 'manifest_version must be 3');
expect(
  manifest.browser_specific_settings?.gecko?.id === 'llm-translate@junrin-lee.github.io',
  'gecko.id must be llm-translate@junrin-lee.github.io (immutable once listed on AMO)',
);
expect(
  manifest.browser_specific_settings?.gecko?.strict_min_version === '128.0',
  'gecko.strict_min_version must be 128.0',
);
expect(
  Array.isArray(manifest.background?.scripts) && !manifest.background?.service_worker,
  'Firefox MV3 background must be an event page (background.scripts), not a service worker',
);
for (const p of ['storage', 'contextMenus'])
  expect(manifest.permissions?.includes(p), `permissions must include ${p}`);
expect(manifest.host_permissions?.includes('<all_urls>'), 'host_permissions must include <all_urls>');
for (const c of ['translate-selection', 'translate-page'])
  expect(c in (manifest.commands ?? {}), `commands must include ${c}`);
expect(manifest.action?.default_popup === 'popup.html', 'action.default_popup must be popup.html');
expect(manifest.options_ui?.open_in_tab === true, 'options_ui.open_in_tab must be true');

if (failures.length) {
  console.error('✗ firefox manifest verification failed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ firefox manifest OK');
```

- [ ] **Step 2: package.json 加脚本**

在 `"zip:edge": "wxt zip -b edge",` 之后插入:

```json
    "dev:firefox": "wxt -b firefox --mv3",
    "build:firefox": "wxt build -b firefox --mv3",
    "zip:firefox": "wxt zip -b firefox --mv3",
    "verify:firefox": "pnpm build:firefox && node scripts/verify-firefox-manifest.mjs",
    "e2e:firefox": "pnpm zip:firefox && vitest run --config vitest.e2e-firefox.config.ts",
```

(`e2e:firefox` 的 config 在 Task 7 才创建,此前不要运行它。)

- [ ] **Step 3: 跑校验,确认按预期失败**

Run: `pnpm verify:firefox`
Expected: 构建成功,随后脚本以 exit 1 失败,输出含 `gecko.id must be …` 与 `gecko.strict_min_version must be 128.0`(background/permissions 等其余断言应已通过——spike 已验证)。

- [ ] **Step 4: wxt.config.ts 注入 gecko 身份**

把 `manifest: { … }` 对象(现第 26–50 行)改为函数,原字段全部保留:

```ts
  manifest: ({ browser }) => ({
    name: BRAND.name,
    description:
      'Selection & full-page translation powered by your own OpenAI-compatible or Anthropic-compatible LLM API.',
    // Minimal permission set — justifications live in docs/adr/0001 and store-assets (T5.4).
    // storage:      local persistence of settings & translation cache (ADR-0002)
    // contextMenus: right-click "Translate page / Translate selection" (T3.10)
    permissions: ['storage', 'contextMenus'],
    // The content script runs on every page (selection + full-page DOM), and the
    // background must reach any user-configured LLM Base URL. See ADR-0001.
    host_permissions: ['<all_urls>'],
    // Handlers registered in background (T2.6 / T3.10). suggested_key is a hint;
    // Chrome silently drops it on conflict and the user can rebind at
    // chrome://extensions/shortcuts.
    commands: {
      'translate-selection': {
        suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' },
        description: 'Translate the current selection',
      },
      'translate-page': {
        suggested_key: { default: 'Ctrl+Shift+P', mac: 'Command+Shift+P' },
        description: 'Translate the whole page',
      },
    },
    // AMO identity — immutable once listed (ADR-0005). Chrome/Edge ignore the key,
    // so only emit it for Firefox to keep their store validators quiet.
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'llm-translate@junrin-lee.github.io', strict_min_version: '128.0' },
          },
        }
      : {}),
  }),
```

- [ ] **Step 5: 跑校验,确认通过;确认 Chrome 产物不受影响**

Run: `pnpm verify:firefox && pnpm build && node -e "const m=require('./.output/chrome-mv3/manifest.json'); if (m.browser_specific_settings) throw new Error('chrome manifest must not carry browser_specific_settings'); console.log('chrome OK')"`
Expected: `✓ firefox manifest OK` 与 `chrome OK`。

- [ ] **Step 6: 全绿检查并 commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全部通过。

```bash
git add wxt.config.ts package.json scripts/verify-firefox-manifest.mjs
git commit -m "feat(build): firefox MV3 target with gecko identity + manifest verifier"
```

---

### Task 2: 权限模块 `src/permissions.ts`(TDD)

**Files:**
- Create: `src/permissions.ts`
- Test: `tests/permissions/permissions.test.ts`

**Interfaces:**
- Consumes: WXT 全局 `browser`(auto-import);`wxt/testing` 的 `fakeBrowser`。
- Produces(Task 4/5/6 依赖,签名必须一字不差):
  - `hasHostAccess(): Promise<boolean>`
  - `requestHostAccess(): Promise<boolean>`(必须在用户手势中调用)
  - `watchHostAccess(onChange: (granted: boolean) => void): () => void`(返回取消监听函数)
  - `focusOrOpenOnboarding(): Promise<void>`
  - `syncActionBadge(): Promise<void>`

- [ ] **Step 1: 写失败测试**

创建 `tests/permissions/permissions.test.ts`。fakeBrowser 未实现 `permissions`/`action`,测试自带最小 stub:

```ts
import { fakeBrowser } from 'wxt/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  focusOrOpenOnboarding,
  hasHostAccess,
  syncActionBadge,
  watchHostAccess,
} from '@/permissions';

type Listener = () => void;

/** Minimal permissions stub: fakeBrowser doesn't implement this namespace. */
function stubPermissions(initialGranted: boolean) {
  let granted = initialGranted;
  const added = new Set<Listener>();
  const removed = new Set<Listener>();
  // biome-ignore lint/suspicious/noExplicitAny: augmenting the fake
  (fakeBrowser as any).permissions = {
    contains: async () => granted,
    request: async () => {
      granted = true;
      for (const l of added) l();
      return true;
    },
    onAdded: { addListener: (l: Listener) => added.add(l), removeListener: (l: Listener) => added.delete(l) },
    onRemoved: {
      addListener: (l: Listener) => removed.add(l),
      removeListener: (l: Listener) => removed.delete(l),
    },
  };
  return {
    revoke() {
      granted = false;
      for (const l of removed) l();
    },
    listenerCount: () => added.size + removed.size,
  };
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('hasHostAccess', () => {
  it('reflects permissions.contains', async () => {
    stubPermissions(false);
    await expect(hasHostAccess()).resolves.toBe(false);
    stubPermissions(true);
    await expect(hasHostAccess()).resolves.toBe(true);
  });
});

describe('watchHostAccess', () => {
  it('notifies on grant and revoke, and unsubscribes cleanly', async () => {
    const stub = stubPermissions(false);
    const seen: boolean[] = [];
    const unwatch = watchHostAccess((g) => seen.push(g));
    await fakeBrowser.permissions.request({ origins: ['<all_urls>'] });
    await vi.waitFor(() => expect(seen).toEqual([true]));
    stub.revoke();
    await vi.waitFor(() => expect(seen).toEqual([true, false]));
    unwatch();
    expect(stub.listenerCount()).toBe(0);
  });
});

describe('focusOrOpenOnboarding', () => {
  it('opens the onboarding tab once, then focuses the existing one', async () => {
    stubPermissions(false);
    await focusOrOpenOnboarding();
    await focusOrOpenOnboarding();
    const tabs = await fakeBrowser.tabs.query({});
    const url = fakeBrowser.runtime.getURL('/onboarding.html');
    expect(tabs.filter((t) => t.url === url)).toHaveLength(1);
  });
});

describe('syncActionBadge', () => {
  it('shows "!" when access is missing and clears it when granted', async () => {
    const setBadgeText = vi.fn();
    const setBadgeBackgroundColor = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: augmenting the fake
    (fakeBrowser as any).action = { setBadgeText, setBadgeBackgroundColor };
    stubPermissions(false);
    await syncActionBadge();
    expect(setBadgeText).toHaveBeenLastCalledWith({ text: '!' });
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#b3261e' });
    stubPermissions(true);
    await syncActionBadge();
    expect(setBadgeText).toHaveBeenLastCalledWith({ text: '' });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/permissions/permissions.test.ts`
Expected: FAIL,报 `Cannot find module '@/permissions'`(或等价的解析错误)。

- [ ] **Step 3: 最小实现**

创建 `src/permissions.ts`:

```ts
/**
 * Host-access (<all_urls>) helpers behind Permission Onboarding (ADR-0005).
 * On Chrome host_permissions are granted at install, so hasHostAccess() is
 * always true and every UI hanging off it stays hidden — no browser sniffing.
 */
const HOST_ACCESS = { origins: ['<all_urls>'] } as const;

const ONBOARDING_PATH = '/onboarding.html';

export function hasHostAccess(): Promise<boolean> {
  return browser.permissions.contains(HOST_ACCESS);
}

/** Must be called from a user gesture (button click) — browsers reject otherwise. */
export function requestHostAccess(): Promise<boolean> {
  return browser.permissions.request(HOST_ACCESS);
}

/** Re-checks and reports on every grant/revoke. Returns an unsubscribe. */
export function watchHostAccess(onChange: (granted: boolean) => void): () => void {
  const notify = () => void hasHostAccess().then(onChange);
  browser.permissions.onAdded.addListener(notify);
  browser.permissions.onRemoved.addListener(notify);
  return () => {
    browser.permissions.onAdded.removeListener(notify);
    browser.permissions.onRemoved.removeListener(notify);
  };
}

/** Open the onboarding page, or focus it if a tab is already showing it. */
export async function focusOrOpenOnboarding(): Promise<void> {
  const url = browser.runtime.getURL(ONBOARDING_PATH);
  const tabs = await browser.tabs.query({});
  const existing = tabs.find((t) => t.url === url);
  if (existing?.id != null) await browser.tabs.update(existing.id, { active: true });
  else await browser.tabs.create({ url, active: true });
}

/** Mirror the grant state onto the toolbar icon: "!" badge while access is missing. */
export async function syncActionBadge(): Promise<void> {
  const granted = await hasHostAccess();
  await browser.action.setBadgeText({ text: granted ? '' : '!' });
  if (!granted) await browser.action.setBadgeBackgroundColor({ color: '#b3261e' });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/permissions/permissions.test.ts`
Expected: 4 个用例 PASS。若 `focusOrOpenOnboarding` 用例因 fakeBrowser 的 `runtime.getURL` 前缀差异失败,断言改为 `tabs.filter((t) => t.url?.endsWith('/onboarding.html'))`——实现不改。

- [ ] **Step 5: 全绿检查并 commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全部通过。

```bash
git add src/permissions.ts tests/permissions/permissions.test.ts
git commit -m "feat(permissions): host-access helpers for permission onboarding (ADR-0005)"
```

---

### Task 3: i18n 文案(EN + ZH)

**Files:**
- Modify: `src/i18n/messages.ts`(`EN` 对象末尾与 `ZH` 对象末尾各追加同一批 key)

**Interfaces:**
- Consumes: 无。
- Produces(Task 4/5 通过 `t('key')` / `useT()` 消费的 key,名称必须一字不差):`permBannerText`、`permBannerAction`、`onboardingTitle`、`onboardingWhy`、`onboardingGrant`、`onboardingGranted`、`onboardingNext`、`onboardingOpenSettings`、`onboardingManual`。

- [ ] **Step 1: EN 对象末尾追加**

在 `const EN = {` 对象的最后一个 key 之后追加(保持既有分组注释风格):

```ts
  // Permission onboarding (Firefox treats site access as optional — ADR-0005)
  permBannerText: 'Site access is off — translation cannot run on any page.',
  permBannerAction: 'Grant access',
  onboardingTitle: 'One step before you translate',
  onboardingWhy:
    'LLM Translate reads the text of the page you are viewing to translate it, and talks only to the LLM endpoint you configure. Firefox asks you to grant this site access explicitly.',
  onboardingGrant: 'Grant site access',
  onboardingGranted: 'All set! You can close this page.',
  onboardingNext: 'Next: add your LLM provider in Settings.',
  onboardingOpenSettings: 'Open Settings',
  onboardingManual:
    'Firefox dismissed the request. You can also enable it under about:addons → LLM Translate → Permissions.',
```

- [ ] **Step 2: ZH 对象末尾追加同名 key**

```ts
  // Permission onboarding(Firefox 将站点访问视为可选权限 — ADR-0005)
  permBannerText: '站点访问权限未开启——翻译功能无法在任何页面工作。',
  permBannerAction: '立即授权',
  onboardingTitle: '开始翻译前,还差一步',
  onboardingWhy:
    'LLM Translate 需要读取你正在浏览的页面文本来完成翻译,并且只与你自己配置的 LLM 接口通信。Firefox 要求你显式授予这项站点访问权限。',
  onboardingGrant: '授予站点访问权限',
  onboardingGranted: '搞定!可以关闭此页了。',
  onboardingNext: '下一步:在设置中添加你的 LLM Provider。',
  onboardingOpenSettings: '打开设置',
  onboardingManual: 'Firefox 未完成授权。你也可以在 about:addons → LLM Translate → 权限 中手动开启。',
```

- [ ] **Step 3: 类型即测试——typecheck 验证 EN/ZH key 对齐**

Run: `pnpm typecheck && pnpm test`
Expected: 通过(若 ZH 漏 key,tsc 会在 messages.ts 报错——这就是该文件的既有防护)。

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages.ts
git commit -m "feat(i18n): permission-onboarding copy (en + zh)"
```

---

### Task 4: Onboarding entrypoint

**Files:**
- Create: `src/entrypoints/onboarding/index.html`
- Create: `src/entrypoints/onboarding/main.tsx`
- Create: `src/entrypoints/onboarding/App.tsx`
- Create: `src/entrypoints/onboarding/style.css`
- Modify: `scripts/verify-firefox-manifest.mjs`(追加产物存在性断言)

**Interfaces:**
- Consumes: Task 2 的 `hasHostAccess` / `requestHostAccess`;Task 3 的 `onboarding*` key;`useT`(`@/i18n/useI18n`)、`setUiLanguage`(`@/i18n`)、`getSettings`(`@/storage`)、`BRAND`(`@/brand`)。
- Produces: 构建产物 `onboarding.html`(WXT unlisted page),Task 2 的 `focusOrOpenOnboarding` 打开的就是它;Task 7 的 e2e 会直接导航到它。

- [ ] **Step 1: 校验脚本先行——追加断言(此刻失败)**

在 `scripts/verify-firefox-manifest.mjs` 顶部 import 区加入 `existsSync`,并在 `console.log('✓ firefox manifest OK');` 之前插入:

```js
expect(
  existsSync(new URL('onboarding.html', OUT)),
  'onboarding.html must be emitted (permission onboarding entrypoint)',
);
```

首行 import 改为:`import { existsSync, readFileSync } from 'node:fs';`

Run: `pnpm verify:firefox`
Expected: FAIL,仅剩 `onboarding.html must be emitted …` 一条。

- [ ] **Step 2: 创建 entrypoint 四件套**

`src/entrypoints/onboarding/index.html`(仿 popup 模板):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LLM Translate</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/entrypoints/onboarding/main.tsx`(与 popup/main.tsx 同构;先看一眼该文件,如它还做了别的初始化就照搬):

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
```

`src/entrypoints/onboarding/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { BRAND } from '@/brand';
import { setUiLanguage } from '@/i18n';
import { useT } from '@/i18n/useI18n';
import { hasHostAccess, requestHostAccess } from '@/permissions';
import { getSettings } from '@/storage';

export function App() {
  const t = useT();
  // null = still checking; true/false = known state.
  const [granted, setGranted] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    document.title = BRAND.name;
    void getSettings().then((s) => setUiLanguage(s.general.uiLang));
    void hasHostAccess().then(setGranted);
  }, []);

  async function grant() {
    const ok = await requestHostAccess();
    setGranted(ok);
    setDismissed(!ok);
  }

  if (granted == null) return null;
  return (
    <main className="onboarding">
      <h1 className="onboarding__title">{BRAND.name}</h1>
      {granted ? (
        <>
          <p className="onboarding__done">✓ {t('onboardingGranted')}</p>
          <p className="onboarding__hint">{t('onboardingNext')}</p>
          <button
            type="button"
            className="onboarding__btn"
            onClick={() => browser.runtime.openOptionsPage()}
          >
            {t('onboardingOpenSettings')}
          </button>
        </>
      ) : (
        <>
          <h2 className="onboarding__subtitle">{t('onboardingTitle')}</h2>
          <p className="onboarding__hint">{t('onboardingWhy')}</p>
          <button type="button" className="onboarding__btn" onClick={grant}>
            {t('onboardingGrant')}
          </button>
          {dismissed && <p className="onboarding__manual">{t('onboardingManual')}</p>}
        </>
      )}
    </main>
  );
}
```

`src/entrypoints/onboarding/style.css`(自包含,不依赖其它入口的样式):

```css
body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #fafafa;
  color: #1f1f1f;
}

.onboarding {
  max-width: 460px;
  margin: 12vh auto 0;
  padding: 32px;
  background: #fff;
  border: 1px solid #e4e4e4;
  border-radius: 12px;
}

.onboarding__title {
  margin: 0 0 4px;
  font-size: 18px;
}

.onboarding__subtitle {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.onboarding__hint {
  margin: 0 0 20px;
  font-size: 13.5px;
  line-height: 1.6;
  color: #555;
}

.onboarding__btn {
  border: 0;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 14px;
  background: #1a73e8;
  color: #fff;
  cursor: pointer;
}

.onboarding__done {
  margin: 0 0 8px;
  font-size: 15px;
  color: #188038;
}

.onboarding__manual {
  margin-top: 14px;
  font-size: 12.5px;
  color: #b3261e;
}
```

- [ ] **Step 3: 校验通过**

Run: `pnpm verify:firefox`
Expected: `✓ firefox manifest OK`(onboarding.html 断言随之通过)。

- [ ] **Step 4: 手动目检(可选但建议)**

Run: `pnpm dev:firefox`(WXT 拉起 Firefox 并临时装载)。在地址栏打开 `about:debugging#/runtime/this-firefox` 找到扩展的 Manifest URL 得到内部 UUID,访问 `moz-extension://<uuid>/onboarding.html`:未授权时应显示标题 + 授权按钮;点击后 Firefox 弹出确认,接受后页面切换到 ✓ 成功态。
Expected: 上述行为成立。若临时装载时 Firefox 已默认授予站点访问,页面直接显示成功态——也算通过(把观察结果记录到 Task 7 Step 3 要用)。

- [ ] **Step 5: 全绿检查并 commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/entrypoints/onboarding scripts/verify-firefox-manifest.mjs
git commit -m "feat(onboarding): post-install permission onboarding page"
```

---

### Task 5: PermissionBanner + popup/options 集成

**Files:**
- Create: `src/ui/PermissionBanner.tsx`
- Create: `src/ui/permission-banner.css`
- Modify: `src/entrypoints/popup/App.tsx:72-73`(`<main>` 内首元素)
- Modify: `src/entrypoints/options/App.tsx`(根容器内首元素;先读该文件定位)

**Interfaces:**
- Consumes: Task 2 的 `hasHostAccess` / `requestHostAccess` / `watchHostAccess`;Task 3 的 `permBannerText` / `permBannerAction`。
- Produces: `PermissionBanner(): JSX.Element | null`(无 props;已授权时 render null)。

- [ ] **Step 1: 组件与样式**

`src/ui/PermissionBanner.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/useI18n';
import { hasHostAccess, requestHostAccess, watchHostAccess } from '@/permissions';
import './permission-banner.css';

/** Warns when site access is missing (Firefox MV3 treats it as optional — ADR-0005). */
export function PermissionBanner() {
  const t = useT();
  // Start optimistic so Chrome (always granted) never flashes the banner.
  const [granted, setGranted] = useState(true);

  useEffect(() => {
    void hasHostAccess().then(setGranted);
    return watchHostAccess(setGranted);
  }, []);

  if (granted) return null;
  return (
    <div className="perm-banner" role="alert">
      <span className="perm-banner__text">{t('permBannerText')}</span>
      <button
        type="button"
        className="perm-banner__btn"
        onClick={async () => setGranted(await requestHostAccess())}
      >
        {t('permBannerAction')}
      </button>
    </div>
  );
}
```

`src/ui/permission-banner.css`:

```css
.perm-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fdecea;
  color: #b3261e;
  font-size: 12.5px;
  line-height: 1.4;
}

.perm-banner__btn {
  flex-shrink: 0;
  border: 0;
  border-radius: 6px;
  padding: 4px 10px;
  background: #b3261e;
  color: #fff;
  font-size: 12.5px;
  cursor: pointer;
}
```

- [ ] **Step 2: 挂到 popup**

`src/entrypoints/popup/App.tsx`:顶部 import 区加 `import { PermissionBanner } from '@/ui/PermissionBanner';`,并把

```tsx
    <main className="popup">
      <h1 className="popup__title">{BRAND.name}</h1>
```

改为

```tsx
    <main className="popup">
      <PermissionBanner />
      <h1 className="popup__title">{BRAND.name}</h1>
```

- [ ] **Step 3: 挂到 options**

打开 `src/entrypoints/options/App.tsx`,同样 import,并在最外层容器 JSX 的第一个子元素位置插入 `<PermissionBanner />`(与 popup 同法;若根节点是布局容器,放主内容列顶部,保证任何 tab 下可见)。

- [ ] **Step 4: 构建 + 手动目检**

Run: `pnpm verify:firefox && pnpm dev:firefox`
Expected: 构建绿。Firefox 中若站点访问被撤销(about:addons → 扩展 → 权限,关掉"访问所有网站的数据"),打开 popup 与设置页均出现红色警示条;点击"立即授权"弹 Firefox 确认框,接受后警示条即时消失(watch 生效,无需刷新)。Chrome 下 `pnpm dev` 打开 popup,确认警示条从不出现。

- [ ] **Step 5: 全绿检查并 commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/ui/PermissionBanner.tsx src/ui/permission-banner.css src/entrypoints/popup/App.tsx src/entrypoints/options/App.tsx
git commit -m "feat(ui): permission warning banner in popup and options"
```

---

### Task 6: background 集成(badge + 安装引导 + 入口兜底)

**Files:**
- Modify: `src/entrypoints/background.ts`(import 区、26–35 行 `sendToActiveTab`、70 行 `defineBackground` 开头、87–97 行 `onInstalled`、99–108 行 `contextMenus.onClicked`)

**Interfaces:**
- Consumes: Task 2 的 `focusOrOpenOnboarding` / `hasHostAccess` / `syncActionBadge` / `watchHostAccess`。
- Produces: 无新接口(行为:装机未授权 → 打开 onboarding;未授权时工具栏 "!" 角标;菜单/快捷键在未授权页触发 → 打开 onboarding)。

- [ ] **Step 1: import 权限模块**

第 1 行后加:

```ts
import { focusOrOpenOnboarding, hasHostAccess, syncActionBadge, watchHostAccess } from '@/permissions';
```

- [ ] **Step 2: 兜底改造 `sendToActiveTab`**

把 26–35 行改为:

```ts
async function sendToActiveTab(message: ContentMessage): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) {
    try {
      await browser.tabs.sendMessage(tab.id, message);
    } catch {
      // No content script on this tab. If that's because site access was never
      // granted (Firefox MV3), route the user to onboarding; on privileged
      // pages (about:/chrome:) with access granted, stay silent as before.
      if (!(await hasHostAccess())) await focusOrOpenOnboarding();
    }
  }
}
```

- [ ] **Step 3: `defineBackground` 开头接上 badge**

`export default defineBackground(() => {` 后第一行插入:

```ts
  // Toolbar "!" badge while site access is missing; live-updates on grant/revoke.
  void syncActionBadge();
  watchHostAccess(() => void syncActionBadge());
```

- [ ] **Step 4: onInstalled 打开 onboarding**

87 行 listener 改签名并在开头加引导(其余菜单逻辑不动):

```ts
  browser.runtime.onInstalled.addListener(async (details) => {
    // First install without site access (Firefox MV3 opt-out) → onboarding page.
    if (details.reason === 'install' && !(await hasHostAccess())) {
      await focusOrOpenOnboarding();
    }
    const s = await getSettings();
    setUiLanguage(s.general.uiLang);
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({ id: MENU_PAGE, title: t('translatePage'), contexts: ['page'] });
    browser.contextMenus.create({
      id: MENU_SELECTION,
      title: t('translateSelection'),
      contexts: ['selection'],
    });
  });
```

- [ ] **Step 5: 右键菜单兜底**

107 行 `if (message) void browser.tabs.sendMessage(tab.id, message).catch(() => {});` 改为:

```ts
    if (message)
      void browser.tabs.sendMessage(tab.id, message).catch(async () => {
        if (!(await hasHostAccess())) await focusOrOpenOnboarding();
      });
```

- [ ] **Step 6: 手动验证兜底链路**

Run: `pnpm dev:firefox`
在 about:addons 撤销站点访问 → 工具栏图标出现红色 "!" 角标;在任意页面按 `Ctrl+Shift+P`(或右键菜单翻译)→ 自动打开 onboarding 页;授权后角标消失,再按快捷键 → 正常触发翻译(需先配好 Provider 或仅确认不再跳 onboarding)。
Expected: 上述链路成立。

- [ ] **Step 7: 全绿检查并 commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/entrypoints/background.ts
git commit -m "feat(background): badge + onboarding fallbacks when site access is missing"
```

---

### Task 7: Firefox e2e 冒烟(selenium-webdriver)

**Files:**
- Modify: `package.json`(devDependencies)
- Create: `vitest.e2e-firefox.config.ts`
- Create: `e2e-firefox/global-setup.ts`
- Create: `e2e-firefox/support.ts`
- Create: `e2e-firefox/smoke.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `pnpm zip:firefox` 产物(`.output/*-firefox.zip`);既有 `e2e/mock-llm.mjs`(8787 端口)与 `e2e/support.ts` 中 `seedSettings` 的 settings 字面量;Task 4 的 onboarding 页。
- Produces: `pnpm e2e:firefox` 可运行的冒烟套件。前置:本机安装 Firefox(≥128);Selenium Manager 自动获取 geckodriver。

- [ ] **Step 1: 安装依赖**

Run: `pnpm add -D selenium-webdriver @types/selenium-webdriver`
Expected: 安装成功(selenium-webdriver ≥ 4.20,内置 Selenium Manager,无需单独装 geckodriver)。

- [ ] **Step 2: vitest 独立配置 + mock server 全局装配**

`vitest.e2e-firefox.config.ts`(注意:不要用 WxtVitest 插件——这是真浏览器 e2e,不能被 fakeBrowser 污染):

```ts
import { defineConfig } from 'vitest/config';

// Real-browser smoke suite for the Firefox build. Run via `pnpm e2e:firefox`
// (zips the extension first). Kept apart from unit tests: no WxtVitest here.
export default defineConfig({
  test: {
    include: ['e2e-firefox/**/*.spec.ts'],
    globalSetup: ['e2e-firefox/global-setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
```

`e2e-firefox/global-setup.ts`(复用既有 mock LLM):

```ts
import { type ChildProcess, spawn } from 'node:child_process';

const PORT = Number(process.env.MOCK_PORT ?? 8787);

/** Boot e2e/mock-llm.mjs once for the whole suite; kill it on teardown. */
export default async function setup(): Promise<() => void> {
  const proc: ChildProcess = spawn('node', ['e2e/mock-llm.mjs'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://localhost:${PORT}/fixtures/article.html`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return () => {
    proc.kill();
  };
}
```

- [ ] **Step 3: support——装载扩展的 Firefox driver**

`e2e-firefox/support.ts`:

```ts
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Builder, type WebDriver } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(DIR, '../.output');

export const GECKO_ID = 'llm-translate@junrin-lee.github.io';
/** Pinned via the extensions.webextensions.uuids pref so moz-extension:// URLs are stable. */
export const EXT_UUID = 'f1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b';
export const MOCK_PORT = Number(process.env.MOCK_PORT ?? 8787);
export const BASE_URL = `http://localhost:${MOCK_PORT}`;

export const extUrl = (path: string) => `moz-extension://${EXT_UUID}/${path}`;

function findFirefoxZip(): string {
  const file = readdirSync(OUTPUT).find((f) => f.endsWith('-firefox.zip'));
  if (!file) throw new Error('No firefox zip in .output/ — run `pnpm zip:firefox` first.');
  return join(OUTPUT, file);
}

/** Launch Firefox (headless unless HEADED=1) with the built zip temp-installed. */
export async function launchFirefoxWithExtension(): Promise<WebDriver> {
  const options = new firefox.Options();
  if (!process.env.HEADED) options.addArguments('-headless');
  options.setPreference('extensions.webextensions.uuids', JSON.stringify({ [GECKO_ID]: EXT_UUID }));
  const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
  // Temporary install: unsigned zips are allowed, mirroring about:debugging.
  await (driver as unknown as firefox.Driver).installAddon(findFirefoxZip(), true);
  return driver;
}

/** True when <all_urls> is granted inside the extension's own page context. */
export async function queryHostAccess(driver: WebDriver): Promise<boolean> {
  await driver.get(extUrl('options.html'));
  return driver.executeAsyncScript(
    `const done = arguments[0];
     browser.permissions.contains({ origins: ['<all_urls>'] }).then(done);`,
  );
}

/** Seed settings pointing at the mock LLM. Mirrors e2e/support.ts seedSettings. */
export async function seedSettings(driver: WebDriver): Promise<void> {
  await driver.get(extUrl('options.html'));
  // NOTE: copy the full `settings` literal from e2e/support.ts (seedSettings) and
  // inline it below so both suites stay behaviourally identical.
  await driver.executeAsyncScript(
    `const done = arguments[0];
     const settings = /* paste the settings literal from e2e/support.ts, baseUrl = '${BASE_URL}/v1' */;
     browser.storage.local.set({ settings }).then(done);`,
  );
}
```

实现本步骤时打开 `e2e/support.ts`,把 `seedSettings` 里完整的 `settings` 对象(含 `version`、`providers`、其余默认字段)与它实际写入的 storage 键名原样搬进上面的注释位;两处如有出入以 `e2e/support.ts` 为准。

- [ ] **Step 4: 冒烟用例**

`e2e-firefox/smoke.spec.ts`:

```ts
import type { WebDriver } from 'selenium-webdriver';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BASE_URL,
  extUrl,
  launchFirefoxWithExtension,
  queryHostAccess,
  seedSettings,
} from './support';

let driver: WebDriver;
let granted = false;

beforeAll(async () => {
  driver = await launchFirefoxWithExtension();
  granted = await queryHostAccess(driver);
  // Record the fact — Task 4 Step 4 observed whether temp-install grants access.
  console.log(`[smoke] temporary install host access granted: ${granted}`);
});

afterAll(async () => {
  await driver?.quit();
});

describe('firefox smoke', () => {
  it('options page renders', async () => {
    await driver.get(extUrl('options.html'));
    await driver.wait(async () => (await driver.getTitle()) === 'LLM Translate', 10_000);
  });

  it('onboarding page reflects the grant state', async () => {
    await driver.get(extUrl('onboarding.html'));
    const body = await driver.wait(async () => {
      const text = await driver.executeScript<string>('return document.body.innerText');
      return text.trim().length > 0 ? text : null;
    }, 10_000);
    // Granted → success state; not granted → the grant button. Either proves the page works.
    expect(String(body)).toMatch(granted ? /✓/ : /site access|站点访问/i);
  });

  it('selection translation streams over the mock LLM', async (ctx) => {
    if (!granted) return ctx.skip(); // covered by the manual checklist when temp-install doesn't grant
    await seedSettings(driver);
    await driver.get(`${BASE_URL}/fixtures/article.html`);
    // Same trigger as e2e/selection.spec.ts: select #p1, dispatch mouseup.
    await driver.wait(async () => {
      await driver.executeScript(`
        const el = document.querySelector('#p1');
        if (!el) throw new Error('fixture paragraph missing');
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      `);
      const text = await driver.executeScript<string>(
        `return document.querySelector('.llmt-panel .llmt-text')?.textContent ?? ''`,
      );
      return text.includes('[[MT]]');
    }, 30_000);
  });
});
```

- [ ] **Step 5: 跑通**

Run: `pnpm e2e:firefox`
Expected: 3 个用例通过(或第 3 个因未授权 skip,console 有 `granted: false` 记录)。若 `installAddon` 报 zip 相关错误,确认传入的是 `.output/llm-translate-<version>-firefox.zip` 而非 sources zip(`findFirefoxZip` 的 endsWith 已排除 `-sources.zip`,但要目检)。若 temp-install 不授予权限,先尝试在 `launchFirefoxWithExtension` 追加 `options.setPreference('extensions.originControls.grantByDefault', true)` 再跑;pref 无效就保留 skip 路径(手动清单兜底),并在 spec 顶部注释记录结论。

- [ ] **Step 6: 全绿检查并 commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`(确认单测套件不受新 config 影响)

```bash
git add package.json pnpm-lock.yaml vitest.e2e-firefox.config.ts e2e-firefox/
git commit -m "test(e2e): firefox smoke suite via selenium-webdriver"
```

---

### Task 8: 手动 smoke 清单 + 文档双语更新

**Files:**
- Create: `docs/firefox-smoke.md`、`docs/firefox-smoke.zh-CN.md`
- Modify: `README.md:36`(`### 1. Get the extension` 节)与 `README.md:96`(`### Commands` 节);`README.zh-CN.md:36` / `README.zh-CN.md:96` 对应节
- Modify: `docs/INSTALL.md`、`docs/INSTALL.zh-CN.md`(新增 Firefox 安装章节)
- Modify: `docs/plan.md:17`、`docs/plan.zh-CN.md:17`(决策表 #1)

**Interfaces:**
- Consumes: Task 1–7 全部落地后的真实行为。
- Produces: 发布前人工验证清单;用户可按文档在 Firefox 安装使用。

- [ ] **Step 1: 手动清单(双语,内容一致)**

`docs/firefox-smoke.md` 骨架(zh-CN 版同结构翻译):

```markdown
# Firefox release smoke checklist

**English** · [简体中文](./firefox-smoke.zh-CN.md)

Run before every AMO submission, on the latest Firefox release, with the zip from `pnpm zip:firefox` temp-installed via about:debugging (or the signed build).

## Install & permission
- [ ] Fresh install with site access granted: no onboarding page opens, no toolbar badge.
- [ ] Fresh install with site access declined: onboarding opens automatically; grant button works; page flips to the success state.
- [ ] Revoke site access in about:addons: toolbar shows the red "!" badge; popup and settings show the warning banner.
- [ ] Grant from the popup banner: banner disappears without reopening; badge clears.
- [ ] Keyboard shortcut / context menu on any page while unauthorized: onboarding page opens (or is focused if already open).

## Core features (mirror of the Chromium e2e)
- [ ] Selection Translation: instant trigger streams a Translation Card; word selection renders a Dictionary Card.
- [ ] Page Translation via toolbar popup: Bilingual Mode inserts translations below source blocks; Translation-only Mode replaces and restores.
- [ ] Context menu entries translate page / selection; menu title flips to "Restore original" after translating.
- [ ] Shortcuts Ctrl+Shift+S / Ctrl+Shift+P work (rebindable at about:addons → gear → Manage Extension Shortcuts).
- [ ] Options: provider CRUD, test connection against a real endpoint, import/export round-trip, cache panel clears both caches.

## Firefox-specific
- [ ] `storage.session` selection cache survives within the session and is gone after a full browser restart.
- [ ] Streaming works on a page served over https (background fetch through host permission, no CORS failures).
- [ ] Popup renders correctly (no scrollbar/clipping differences vs Chrome).
```

- [ ] **Step 2: README 双语更新**

`README.md` `### 1. Get the extension`(36 行)节内:在 Chrome/Edge 安装方式之后补一条 Firefox 项——AMO 链接占位(`*(link after first AMO review)*`)+ 开发者临时装载路径(`about:debugging#/runtime/this-firefox` → Load Temporary Add-on → 选 `pnpm zip:firefox` 产物),并加一句权限说明:"Firefox may ask you to grant site access — the extension guides you through it on first run."
`### Commands`(96 行)命令表补三行:`pnpm dev:firefox` / `pnpm zip:firefox` / `pnpm e2e:firefox`(附一句 Firefox ≥128 前置)。
`README.zh-CN.md` 对应两节同步翻译。

- [ ] **Step 3: docs/INSTALL 双语新增 Firefox 章节**

打开 `docs/INSTALL.md`,按其现有 Chrome/Edge 章节的结构追加 "Install on Firefox" 章:AMO 安装(占位链接)、about:debugging 临时装载步骤、安装时的站点访问勾选说明、撤销后从 popup 警示条/onboarding 恢复的路径。`docs/INSTALL.zh-CN.md` 同步。

- [ ] **Step 4: docs/plan.md 决策表同步**

`docs/plan.md:17` 整行替换为:

```markdown
| 1 | Release target | Publish to Chrome Web Store + Edge Add-ons (shared MV3 build) + Firefox Add-ons/AMO (own MV3 build, ADR-0005) |
```

`docs/plan.zh-CN.md:17` 整行替换为:

```markdown
| 1 | 发布目标 | 上架 Chrome Web Store + Edge Add-ons(同一份 MV3 产物)+ Firefox Add-ons/AMO(独立 MV3 产物,ADR-0005) |
```

- [ ] **Step 5: Commit**

```bash
git add docs/firefox-smoke.md docs/firefox-smoke.zh-CN.md README.md README.zh-CN.md docs/INSTALL.md docs/INSTALL.zh-CN.md docs/plan.md docs/plan.zh-CN.md
git commit -m "docs: firefox install/dev guides, release smoke checklist, plan sync"
```

---

### Task 9: AMO 发布准备

**Files:**
- Create: `store-assets/amo-reviewer-notes.md`
- Modify: `store-assets/listing.en.md`、`store-assets/listing.zh.md`(追加 AMO 段)
- Modify: `store-assets/justifications.md`(权限说明补 Firefox 视角一句)

**Interfaces:**
- Consumes: Task 1 的 `pnpm zip:firefox`(产出扩展 zip + sources zip)。
- Produces: 提交 AMO 所需的全部文字材料;实际注册/上传是人工步骤(见 Step 4)。

- [ ] **Step 1: 验证 sources zip**

Run: `pnpm zip:firefox && ls .output/*.zip && unzip -l .output/*-sources.zip | head -30`
Expected: 存在 `llm-translate-<version>-firefox.zip` 与 `llm-translate-<version>-sources.zip`;sources zip 内含 `package.json`、`pnpm-lock.yaml`、`wxt.config.ts`、`src/`(即审核员可复现构建)。若缺 sources zip,在 `wxt.config.ts` 顶层加 `zip: { downloadPackages: [] }` 并查 WXT 文档 `zip.includeSources` 相关选项后重试。

- [ ] **Step 2: 审核员构建说明**

创建 `store-assets/amo-reviewer-notes.md`(提交表单 "Notes to Reviewer" 直接粘贴用):

```markdown
# AMO reviewer notes (paste into "Notes to Reviewer")

Build environment: Node >= 20.19, pnpm 9.15.9 (pinned via package.json packageManager).

Reproduce the submitted xpi from the sources zip:

    pnpm install --frozen-lockfile
    pnpm zip:firefox
    # output: .output/llm-translate-<version>-firefox.zip

The extension has no backend and no bundled remote code. All translation traffic
goes directly from the extension to the LLM endpoint the user configures
(OpenAI- or Anthropic-compatible). `<all_urls>` host permission: the content
script provides selection/page translation on any site, and the background
fetches the user-configured endpoint (see docs/adr/0001 in the sources zip).
```

- [ ] **Step 3: listing 文案补 AMO 段**

`store-assets/listing.en.md` 末尾追加 `## AMO (Firefox Add-ons)` 段:复用现有 listing 简介,外加一段 Firefox 特有说明(安装时请保留 "site access" 勾选;若跳过,扩展首启会打开引导页帮助开启)。`store-assets/listing.zh.md` 同步中文。`store-assets/justifications.md` 的 `<all_urls>` 条目补一句:"On Firefox (MV3) this is user-revocable; the extension degrades to an explicit Permission Onboarding flow instead of breaking silently."

- [ ] **Step 4: 人工提交清单(记录在 PR 描述,不是代码)**

按序人工执行:注册/登录 <https://addons.mozilla.org> 开发者账号 → Submit a New Add-on → listed → 上传 `llm-translate-<version>-firefox.zip` → 勾选需要源代码并上传 `-sources.zip` → 粘贴 `amo-reviewer-notes.md` → listing 文案取自 `store-assets/listing.*.md` → 截图复用 `store-assets/screenshots/` → 隐私政策链接指向仓库 `docs/privacy-policy.md` 的公开地址。提交后把 AMO 链接回填 README/INSTALL 的占位(小 commit:`docs: fill AMO listing url`)。

- [ ] **Step 5: Commit**

```bash
git add store-assets/amo-reviewer-notes.md store-assets/listing.en.md store-assets/listing.zh.md store-assets/justifications.md
git commit -m "chore(store): AMO listing copy, reviewer notes, permission justification"
```

---

## 完成定义(整体验收)

- `pnpm verify:firefox`、`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm e2e`(Chromium 回归)、`pnpm e2e:firefox` 全绿。
- `docs/firefox-smoke.md` 清单在最新 Firefox 稳定版人工过一遍,全部勾选。
- Chrome 侧零行为变化:popup/options 不出现警示条,onboarding 永不打开(host permission 安装即授予)。
- AMO 提交材料齐备(Task 9),实际上架审核为异步人工流程,不阻塞本分支合并。
