# 安装 LLM Translate

[English](./INSTALL.md) · **简体中文**

本指南带你在**不经过商店**的情况下,把 LLM Translate 装进 **Chrome、Edge 或
Firefox**,并完成首次配置。大约两分钟。

> LLM Translate 目前尚未上架 Chrome Web Store 或 Firefox Add-ons(AMO)。三款浏览器
> 都不允许非商店扩展的一键安装,所以需要加载预构建的安装包——Chrome / Edge 见下文,
> Firefox 见专门的章节([在 Firefox 上安装](#install-on-firefox))。

## 开始前准备

- **Google Chrome、Microsoft Edge 或 Firefox**(较新版本即可;Firefox 需 128 及以上)。
- **一个 API Key**:来自 OpenAI 兼容或 Anthropic 兼容的服务商——真正负责翻译的是它
  (自带密钥 BYOK)。可在 OpenAI 平台、Anthropic 控制台,或任意兼容网关处获取。第 3 步
  会用到,先准备好。

## 1. 下载扩展

1. 打开[ Releases 页面](https://github.com/Junrin-Lee/llm-translate/releases)。
2. 在最新一个 release 下,下载对应你浏览器的 zip:
   - Chrome → `llm-translate-<版本>-chrome.zip`
   - Edge → `llm-translate-<版本>-edge.zip`
   - Firefox → 加载方式不同,请直接看[在 Firefox 上安装](#install-on-firefox)(不用在这里下载)
3. **解压到一个你会长期保留的文件夹**——比如 `文档/llm-translate`。解压后**别删、别移**
   这个文件夹:浏览器是直接从这个位置加载扩展的。

> **还没有 release?** 要么从源码自行构建(见文末),要么请维护者发布一个。

## 2. 加载到浏览器

本节步骤适用于 **Chrome** 与 **Edge**(同为 Chromium 内核,方式一致)。**Firefox 也受
支持,但加载方式不同——请直接跳到[在 Firefox 上安装](#install-on-firefox),不要套用下面
的步骤。**

### Chrome

1. 打开 `chrome://extensions`。
2. 打开右上角的 **开发者模式**。
3. 点 **加载已解压的扩展程序**。
4. 选中第 1 步解压出的**文件夹**(里面有 `manifest.json` 的那个)。

### Edge

1. 打开 `edge://extensions`。
2. 打开左下角的 **开发人员模式**。
3. 点 **加载解压缩的扩展**。
4. 选中第 1 步解压出的**文件夹**。

工具栏上就会出现 LLM Translate 图标。点拼图图标把它固定,方便随时点。

> Chrome 启动时可能弹出**"停用开发者模式扩展程序"**的提示。用这种方式安装的扩展都会有,
> 属于正常现象——关掉即可,扩展照常工作。

### Firefox

Firefox 的加载方式和 Chromium 不同(临时载入,或安装签名后的 `.xpi`)。请移步专门的章节:
[在 Firefox 上安装](#install-on-firefox)。

<a id="open-a-normal-page"></a>

## ⚠️ 装好后必读:先切到一个普通网页

> [!IMPORTANT]
> **扩展在浏览器的内部页面(`chrome://extensions`、`edge://extensions`)上不会运行。**
> 如果你装完就停留在这个页面,会看不到任何翻译功能、也找不到设置入口——这**不代表**没装成功。

请**新开一个标签页打开任意网站**(或刷新已经开着的页面),然后:

1. 点工具栏上的 **LLM Translate 图标**(没看到就点浏览器右上角的**拼图图标**,把它固定住)。
2. 选 **打开设置**,即可进入下面第 3 步的配置。

> 已经开着的旧标签页需要**刷新**后才生效——内容脚本只对安装后新打开或刷新过的页面注入。

## 3. 配置 API Key

1. 点 LLM Translate 图标 → **打开设置**(或右键图标 → 选项)。
2. 进入 **服务商 (Providers)** → **添加服务商**。
3. 填写:
   - **协议** —— OpenAI 兼容 或 Anthropic 兼容。
   - **Base URL** —— 如 `https://api.openai.com/v1` 或 `https://api.anthropic.com`
     (或你自己的网关)。
   - **API Key** —— 粘贴你的密钥。只保存在本机,不同步、不上传,除了发往你在这里配置的
     端点外不会去任何地方。
   - **模型** —— 手动填写,或点 **获取模型** 从列表里选。
4. 点 **测试连接**,看到 **已连接** 即成功。

## 4. 开始翻译

- **划词** —— 在任意页面选中文本,点浮出的图标(或按 `Ctrl/⌘ + Shift + S`)。
- **整页** —— 点工具栏图标 → **翻译此页**(或按 `Ctrl/⌘ + Shift + P`,或右键 → 翻译此页)。

![划词翻译浮层](../store-assets/screenshots/01-selection.png)

![全文双语翻译](../store-assets/screenshots/02-page-bilingual.png)

完整功能(词典卡片、双语 / 仅译文、自动翻译站点、自定义提示词等)见 [README](../README.zh-CN.md)。

<a id="install-on-firefox"></a>

## 在 Firefox 上安装

Firefox 不在 Chrome Web Store 里,有自己的商店与独立构建(仍是 Manifest V3,与
Chrome/Edge 一致——见 [ADR-0005](./adr/0005-firefox-mv3-with-permission-onboarding.zh-CN.md))。
可选以下三种方式:

### 方式一:Firefox Add-ons(AMO)

*(链接将在首次 AMO 审核通过后补充,目前尚未上架。)* 上架后,从 AMO 安装只需一次
点击,和安装其他 Firefox 扩展一样。

### 方式二:临时装载(当前可用,或供开发者使用)

1. 构建 zip:先 `pnpm install`,再执行 `pnpm zip:firefox` → 产物为
   `.output/llm-translate-<version>-firefox.zip`(需要 Node.js 20 与 pnpm 9——见本
   指南末尾的**备选:从源码构建**)。
2. 在 Firefox 中打开 `about:debugging#/runtime/this-firefox`。
3. 点击**"临时载入附加组件…"**(Load Temporary Add-on…),直接选中这个 `.zip` 文件——
   Firefox 接受打包好的 zip,不需要先解压。

> **临时装载的扩展会在 Firefox 关闭后被移除。** 在 AMO 正式上架前,每次重启
> Firefox 都需要重复第 2–3 步。

### 方式三:自签名分发——签名后的 `.xpi`,常驻且不进商店

方式二重启即失,而正式版 / Beta 版 Firefox 又拒绝未签名的扩展。想**不上架商店、
又能永久安装**,就通过 **unlisted(自行分发)** 渠道让 Mozilla 给你的包签名,再自己
安装拿回的 `.xpi`。它不会出现在 AMO 搜索里——只有拿到该文件的人才能安装,适合自己
用或小范围内部分发。

需要一个免费的 [Firefox 账号](https://accounts.firefox.com/),以及在
[AMO → Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/) 生成的
API 凭据(**JWT issuer** 与 **secret**)。

1. 从可提交的模板创建 `.env`,再填入两个值(`.env` 本身已被 git 忽略):
   ```sh
   cp .env.example .env
   ```
   然后编辑 `.env`:
   ```
   WEB_EXT_API_KEY=<你的 JWT issuer>
   WEB_EXT_API_SECRET=<你的 JWT secret>
   ```
2. 一条命令完成构建并签名(需 Node.js 20 + pnpm 9):
   ```sh
   pnpm sign:firefox
   ```
   它会构建 `.output/firefox-mv3/`,从 `.env` 读取凭据,并调用 **pin 死的
   `web-ext@7.11.0`**(新版 web-ext 会因我们的压缩产物强制转人工审核)。Mozilla 会
   自动审核 unlisted 提交(通常一两分钟),签名好的包落在
   `web-ext-artifacts/<id>-<version>.xpi`。
3. 安装:`about:addons` → 齿轮图标 ⚙️ → **从文件安装附加组件…** → 选中该 `.xpi`
   (或把文件拖进 Firefox 窗口)→ **添加**。这样安装**重启不消失**。

> **每次更新都要 bump 版本号。** AMO 对每个 `(扩展 ID, 版本)` 只接受一次。要发布代码
> 改动,先在 `wxt.config.ts` / `package.json` 里提升 `version`,重新执行
> `pnpm sign:firefox`,再安装新的 `.xpi`。

> **可能被要求提交源码。** 由于产物是压缩过的,AMO 偶尔会要一份可读源码——遇到时给
> 签名命令加上 `--upload-source-code=<sources.zip>`。

### 授予站点访问权限

和 Chrome/Edge 不同,Firefox 把"读取并更改所有网站数据"这项权限当作**可选且可
撤销**,不是安装时自动授予:

- **安装 / 临时装载时** —— Firefox 可能会弹出权限确认框,或显示一个"允许此扩展在
  所有网站上运行"的开关。请保持**开启**,划词翻译与全文翻译才能在任意页面工作。
- **如果当时拒绝了(或这是第一次启动)** —— 扩展会自动打开一个 onboarding 标签
  页,上面有一个**"授予站点访问权限"**按钮。
- **如果之后撤销了权限**(`about:addons` → LLM Translate → **权限** → 关闭"访问
  您在所有网站上的数据")—— 工具栏图标会出现红色**"!"**角标,popup 与设置页也会
  显示警示条和**"立即授权"**按钮,点击任意一处即可恢复访问——无需重新安装。

站点访问授权完成后,继续参考上文的**第 3 步:配置 API Key**即可。

## 更新

已解压加载的扩展**不会自动更新**。更新方法:

1. 从 Releases 页面下载新的 zip。
2. 解压并覆盖原来的文件夹(位置保持不变)。
3. 打开 `chrome://extensions`(或 `edge://extensions`),点 LLM Translate 卡片上的
   **重新加载**(↻)。

## 常见问题

- **每次启动都弹"开发者模式"提示** —— 加载已解压扩展的正常现象,关掉即可。
- **扩展突然不工作了** —— 多半是解压出的文件夹被移动或删除了。放回原处,或重新加载(第 2 步)。
- **选中文字不出图标** —— 刷新页面(内容脚本只在安装后新打开的页面生效),确认该站点不在
  你的禁用清单里,并确认已配置服务商。
- **提示"未配置服务商"或连接失败** —— 到设置里核对 Base URL 与 API Key,再点测试连接。
- **卸载** —— `chrome://extensions` → 卡片上的 **移除**。

## 备选:从源码构建(面向开发者)

需要 **Node.js 20** 与 **pnpm 9**。

```sh
git clone https://github.com/Junrin-Lee/llm-translate
cd llm-translate
corepack prepare pnpm@9.15.9 --activate   # 若没有 pnpm
pnpm install
pnpm build            # -> .output/chrome-mv3/   (Edge: pnpm build:edge -> .output/edge-mv3/)
```

然后用 **加载已解压的扩展**(第 2 步)加载 `.output/chrome-mv3/`。完整开发流程见
[README](../README.zh-CN.md)。
