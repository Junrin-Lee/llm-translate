# LLM 翻译浏览器扩展

[English](./CONTEXT.md) · **简体中文**

一个面向 Chrome Web Store / Edge Add-ons 发布的浏览器扩展:提供划词翻译与全文翻译两个功能,翻译能力完全由用户自带的 LLM API(OpenAI 兼容协议或 Anthropic 兼容协议)提供,无自建后端、无账号体系。

## Language

### 翻译功能

**划词翻译 (Selection Translation)**:
用户在网页上选中一段文本后触发的即时翻译,结果以浮层就地展示。根据选区形态输出词典卡片或译文卡片。
_Avoid_: 取词翻译、悬停翻译、查词

**词典卡片 (Dictionary Card)**:
选区被判定为单词或短语时,划词翻译输出的词典式结果:音标、词性、多义、例句。
_Avoid_: 查词结果、单词卡

**译文卡片 (Translation Card)**:
选区为句子或段落时,划词翻译输出的纯译文结果。
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

### Provider

**Provider 配置 (Provider Profile)**:
一条命名的翻译服务接入配置,由协议类型、Base URL、API Key、模型名和可选参数组成。用户可保存多条。
_Avoid_: 翻译引擎、服务商、渠道、账号

**协议类型 (Protocol)**:
Provider 配置遵循的 API 形态,只有两种:OpenAI 兼容、Anthropic 兼容。
_Avoid_: 厂商类型、接口类型

**全局默认 Provider (Global Default Provider)**:
未被功能级覆盖时,所有翻译功能实际使用的那条 Provider 配置。
_Avoid_: 当前引擎、激活配置

**功能级覆盖 (Feature Override)**:
划词翻译或全文翻译各自单独指定的 Provider 配置;设置后优先于全局默认 Provider,不设置则跟随全局。
_Avoid_: 独立配置、分渠道

## Example dialogue

> **Dev**: 用户划词之后走哪个模型?
> **Expert**: 先看划词翻译有没有功能级覆盖,有就用覆盖指定的那条 Provider 配置;没有就用全局默认 Provider。
> **Dev**: 那"Provider 配置"里存的是厂商吗?比如 DeepSeek?
> **Expert**: 不是厂商,是一条接入配置。DeepSeek 官方、公司网关代理的 DeepSeek,可以是两条不同的 Provider 配置,它们的协议类型都是 OpenAI 兼容。
