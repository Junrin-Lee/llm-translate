# 安装 LLM Translate

[English](./INSTALL.md) · **简体中文**

本指南带你在**不经过商店**的情况下,把 LLM Translate 装进 **Chrome 或 Edge**,并完成
首次配置。大约两分钟。

> LLM Translate 目前尚未上架 Chrome Web Store。Chrome / Edge 不允许非商店扩展的一键
> 安装,所以需要用"加载已解压的扩展"的方式装入——按下面步骤即可。

## 开始前准备

- **Google Chrome 或 Microsoft Edge**(较新版本即可)。
- **一个 API Key**:来自 OpenAI 兼容或 Anthropic 兼容的服务商——真正负责翻译的是它
  (自带密钥 BYOK)。可在 OpenAI 平台、Anthropic 控制台,或任意兼容网关处获取。第 3 步
  会用到,先准备好。

## 1. 下载扩展

1. 打开[ Releases 页面](https://github.com/Junrin-Lee/llm-translate/releases)。
2. 在最新一个 release 下,下载对应你浏览器的 zip:
   - Chrome → `llm-translate-<版本>-chrome.zip`
   - Edge → `llm-translate-<版本>-edge.zip`
3. **解压到一个你会长期保留的文件夹**——比如 `文档/llm-translate`。解压后**别删、别移**
   这个文件夹:浏览器是直接从这个位置加载扩展的。

> **还没有 release?** 要么从源码自行构建(见文末),要么请维护者发布一个。

## 2. 加载到浏览器

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
