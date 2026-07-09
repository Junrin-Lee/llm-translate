# Firefox 采用 Manifest V3,并配套全渠道权限引导

[English](./0005-firefox-mv3-with-permission-onboarding.md) · **简体中文**

为上架 AMO 增加 Firefox(Gecko)支持时,必须选定 manifest 版本,而默认路径本是 MV2:WXT 的 `firefox` 目标开箱即产出 MV2,Mozilla 对 MV2 没有淘汰时间表,且 MV2 在安装时无条件授予 `<all_urls>`。我们仍然选择了 MV3:所有浏览器共享同一套 manifest 模型,已上架的 AMO 扩展也永远不用背 MV2→MV3 的迁移债。代价是真实存在的:Firefox 把 MV3 的 `host_permissions` 当作可选权限 —— 用户可以在安装对话框中取消勾选站点访问,也可以事后撤销 —— 一旦没有 `<all_urls>`,划词翻译和全文翻译都会静默失效。因此这个决策是成对的,不是单项选择:MV3 **加上**覆盖所有入口的权限引导(安装后引导页、popup/设置页警示条、右键菜单 / 快捷键 / 工具栏角标的运行时兜底、商店文案 —— 见 CONTEXT.zh-CN.md)。扩展身份固定在 `browser_specific_settings.gecko`:`id: llm-translate@junrin-lee.github.io`(AMO 上架后不可变更)、`strict_min_version: 128.0` —— 2024 ESR,同时保证安装对话框默认勾选站点访问(127+)、`storage.session`(115+)与 MV3 本身(109+)。

## Consequences

- Chrome、Edge、Firefox 共用一套 manifest 模型;`wxt.config.ts` 需要显式覆盖 WXT 对 `firefox` 目标的 MV2 默认值。
- 权限引导是产品能力而非 Firefox 专属补丁:同一套代码在 Chrome 下运行,站点访问检测恒为已授予,UI 自然不显示。不引入浏览器探测分支。
- 不支持 128 以下的 Firefox。Gecko 衍生浏览器(LibreWolf、Zen、Waterfox 等)按其底层 Gecko 版本自然继承支持,但不单独测试。
- Firefox 的 MV3 background 以 event page 而非 service worker 运行 —— Firefox 构建必须声明 `background.scripts`;background 代码保持事件驱动、不感知浏览器差异。
- AMO 审核要求随包上传源码 zip 及可复现的构建说明(`wxt zip -b firefox` 会自动生成源码包;构建说明需固定 Node ≥ 20.19 与 pnpm 9.15)。
