# 0003 — 截屏翻译结果卡片无法拖动,遮盖原文

[English](./0003-image-result-panel-not-draggable.md) · **简体中文**

- **报告时间:** 2026-07-15,截屏翻译冒烟期间
- **状态:** 已修复
- **修复验证:** 新增端到端测试 `e2e/image-drag.spec.ts`(先红后绿),全量门禁重跑

## 现象

框选确认后,流式结果卡片固定出现在视口中上方(`left: 50%; top: 20%`),无法移动。在文字密集的
页面上,卡片正好压在用户想对照的原文上。划词翻译弹窗支持拖动避让,截屏翻译卡片却不支持。

## 定位

不是能力缺失,是没接线。共享拖拽 hook [`useDrag`](../../src/ui/useDrag.ts) 已经驱动着
`TranslatePanel`(划词弹窗)和 `PageToolbar`,但 [`ImageResultPanel`](../../src/ui/image/ImageResultPanel.tsx)
从未接入:头部没有 pointer 事件处理器,根元素也没有 ref 和样式覆盖。

该面板还有一个独有的坑:`.llmt-image-panel` 用 `left: 50%` + `transform: translateX(-50%)`
实现居中。`useDrag` 通过 `getBoundingClientRect()` 读取的是元素的**视觉**位置,若只写入拖拽后的
`left`/`top` 而保留 transform,首次拖动时面板会横跳半个自身宽度。

## 修复

在 `ImageResultPanel` 内镜像 `TranslatePanel` 的接法(本分支提交):

- 根元素挂 ref 接入 `useDrag`;拖拽从头部发起(`onPointerDown`),点击按钮时排除
  (`closest('button')`),关闭按钮不受影响;
- 拖拽激活后用 `{ left, top, transform: 'none' }` 覆盖定位——清掉居中 transform,避免半宽横跳;
- 标题 span(`.llmt-panel__grip`)本就带共享的 `cursor: grab` 样式,此次补上 `toolbarDrag`
  悬停提示。

两个宿主渲染同一组件,原地卡片(content script)与 workbench 扩展页一次修复同时生效。

## 验证

- 新增 `e2e/image-drag.spec.ts`:workbench → 上传 → 框选 → 拖头部,断言面板两轴位移均 > 80px。
  先对未修复构建运行(位移 0,红),修复后转绿。
- 全量门禁:210 个单元测试、`typecheck`、`lint`(仅基线警告)、5 个 Playwright 用例全过,
  含 `selection-drag` 回归。
