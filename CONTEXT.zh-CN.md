# LLM 翻译浏览器扩展

[English](./CONTEXT.md) · **简体中文**

一个面向 Chrome Web Store / Edge Add-ons / Firefox Add-ons (AMO) 发布的浏览器扩展:提供划词翻译、全文翻译与截屏翻译三个功能,翻译能力完全由用户自带的 LLM API(OpenAI 兼容协议或 Anthropic 兼容协议)提供,无自建后端、无账号体系。

## Language

### 翻译功能

**划词翻译 (Selection Translation)**:
用户在网页上选中一段文本后触发的即时翻译,结果以浮层就地展示。根据选区形态输出词典卡片或译文卡片。
_Avoid_: 取词翻译、悬停翻译、查词

**词典卡片 (Dictionary Card)**:
选区被判定为单词或短语时,划词翻译输出的词典式结果:音标、词性、多义、例句。
_Avoid_: 查词结果、单词卡

**译文卡片 (Translation Card)**:
选区为句子或段落时,划词翻译输出的纯译文结果;截屏翻译的结果也以同样的形式流式输出。
_Avoid_: 翻译结果框

**全文翻译 (Page Translation)**:
对当前网页可读正文的整页翻译,有双语对照与仅译文两种展示模式。
_Avoid_: 网页翻译、沉浸式翻译、整页翻译

**双语对照 (Bilingual Mode)**:
全文翻译的默认展示模式:译文块插在对应原文块下方,原文保留。
_Avoid_: 对照模式、上下对照

**仅译文 (Translation-only Mode)**:
全文翻译的可选展示模式:译文原地替换原文,原文隐藏但可一键还原。
_Avoid_: 替换模式

**自动翻译站点 (Auto-translate Site)**:
被用户标记为"总是翻译"的域名;访问其页面时自动触发全文翻译。
_Avoid_: 白名单、自动站点

**截屏翻译 (Screenshot Translation)**:
对用户提供的单张图片中文字的翻译 —— 主入口是在当前标签页上拖拽框选截取区域(content script 无法注入的页面,如内置 PDF 阅读器,自动降级为"截取可见区域后在扩展页内裁剪"),也支持粘贴/上传图片。结果以译文卡片流式输出。要求实际解析到的模型配置所选的模型支持图片输入。
_Avoid_: 图片翻译、截图翻译、OCR 翻译

### Provider

**LLM Provider (LLM Provider)**:
一条已保存的 LLM 接口连接,由协议类型、Base URL、API Key 以及可选的默认超时组成,不包含模型名,多条模型配置可以共用同一条。其中 name 是可选的展示标签;每条连接在内部通过稳定的 id 引用,因此 name 为空也能正常工作。
_Avoid_: Provider 配置、翻译引擎、服务商、渠道、账号

**模型配置 (Model Profile)**:
在某一条 LLM Provider 上选定一个模型,外加可选参数(temperature、max tokens、超时)。路由指向的就是它;用户想在同一个接口上换模型时,新增的也是它。它自己的超时优先于 Provider 上的默认值。
_Avoid_: translate model、模型条目、Provider 配置

**协议类型 (Protocol)**:
LLM Provider 遵循的 API 形态,只有两种:OpenAI 兼容、Anthropic 兼容。
_Avoid_: 厂商类型、接口类型

**全局默认模型 (Global Default Model)**:
未被功能级覆盖时,所有翻译功能实际使用的那条模型配置。
_Avoid_: 当前引擎、激活配置、全局默认 Provider

**功能级覆盖 (Feature Override)**:
划词翻译、全文翻译或截屏翻译各自单独指定的模型配置;设置后优先于全局默认模型,不设置则跟随全局。
_Avoid_: 独立配置、分渠道

### 权限

**权限引导 (Permission Onboarding)**:
当浏览器尚未授予扩展站点访问权限时,引导用户完成授权的流程 —— Firefox 将站点访问视为可选、可随时撤销的权限,扩展可能处于"已安装但无法工作"的状态。它涵盖:安装后立即打开的轻量引导页、popup 与设置页中的警示条,以及其余各入口的提示。缺少站点访问权限,划词翻译与全文翻译都无法运行。
_Avoid_: 权限警告、授权流程

## Example dialogue

> **Dev**: 用户划词之后走哪个模型?
> **Expert**: 先看划词翻译有没有功能级覆盖,有就用覆盖指定的那条模型配置;没有就用全局默认模型。
> **Dev**: 那"LLM Provider"里存的是厂商吗?比如 DeepSeek?
> **Expert**: 不是厂商,是一条连接。DeepSeek 官方、公司网关代理的 DeepSeek 是两条不同的 LLM Provider,它们的协议类型都是 OpenAI 兼容。
> **Dev**: 我想在同一个网关上同时用 deepseek-chat 和 deepseek-reasoner,要建两条 Provider 吗?
> **Expert**: 一条 LLM Provider,两条模型配置指向它。Base URL 和 API Key 只存一份,换 key 时两条一起生效。
> **Dev**: 截屏翻译提示"模型不支持图片输入"怎么办?
> **Expert**: 说明它解析到的模型配置(功能级覆盖,或全局默认模型)选的模型不带视觉能力。给截屏翻译设一条功能级覆盖,指到一条模型支持图片输入的模型配置即可。
