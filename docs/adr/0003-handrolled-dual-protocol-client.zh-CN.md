# 自研轻量双协议客户端,不引入 openai / @anthropic-ai/sdk

[English](./0003-handrolled-dual-protocol-client.md) · **简体中文**

`src/llm/` 用原生 fetch + 自研 SSE 解析实现 OpenAI 兼容与 Anthropic 兼容两个 adapter,不依赖官方 SDK。理由:本产品的核心抽象是“两种协议对称可换”,官方 SDK 各带一套不对称的类型与重试语义,统一封装的成本不低于自研;扩展对包体积敏感(content script 常驻所有页面);MV3 service worker 环境下自研 fetch 零适配成本。翻译场景只用到两协议各自的一个 chat 端点 + 模型列表端点,API 面极小且稳定。

## Consequences

- 协议演进(新字段、新流式事件类型)需自行跟进,SSE 解析与错误归一化必须有扎实单测(已列为测试重点)。
- 若未来需要 SDK 级高级能力(工具调用、结构化输出等),再评估局部引入,不影响 adapter 接口。
