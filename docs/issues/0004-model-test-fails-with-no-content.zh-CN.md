# 0004 — 测试模型时请求成功却报 "no content"

[English](./0004-model-test-fails-with-no-content.md) · **简体中文**

- **报告时间:** 2026-10-19,配置 Model Profile 时发现
- **状态:** 已修复
- **修复验证:** 新增 5 个单元测试和 1 个端到端测试(均先红后绿),全量单测、typecheck、e2e 重跑

## 现象

在设置页的 Model 卡片上点「测试模型」,服务端实际返回了 200,界面却显示失败,错误信息是
`Response contained no message content`(OpenAI 协议)或 `Response contained no content`
(Anthropic 协议)。用同一个模型做正常翻译没有问题。

## 根因

`testConnection()` 直接复用了翻译用的 `complete()`,并且把 `max_tokens` 设成 1。
`complete()` 要求响应里必须有文本内容:OpenAI 协议要求 `choices[0].message.content` 是字符串,
Anthropic 协议要求 `content` 是数组。

只给 1 个 token 时,推理类模型(DeepSeek-R1、Qwen3、GLM 等思考模型,以及很多兼容网关后面的同类模型)
会把这个 token 花在 reasoning 上,返回 `content: null`、`finish_reason: "length"`。
`complete()` 把这种响应判成 `bad_response`,于是一次成功的连通性探测被报告成了失败。

翻译时不传 `max_tokens`(除非用户手动设置),模型能正常输出,所以只有测试会出错。

## 证据链

1. `src/messaging/handler.ts` 的 `test-model` 分支调用 `createClient(...).testConnection()`。
2. `src/llm/openai.ts` / `src/llm/anthropic.ts` 的 `testConnection()` 原本执行
   `complete({ user: 'ping', maxTokens: 1 })`。
3. `complete()` 在内容缺失时抛出 `LlmError('bad_response', 'Response contained no ... content')`。
4. 用 `{ choices: [{ message: { content: null }, finish_reason: 'length' }] }` 这样的 200 响应
   写单测,修复前 `testConnection()` 返回 `ok: false`,与用户看到的报错一致。

## 修复

测试只回答三个问题:地址通不通、key 对不对、模型 id 存不存在。它不应该检查回复内容。

- `src/llm/http.ts` 新增 `assertProbeBody()`:2xx 响应只要是 JSON 对象且没有 `error` 字段就算通过。
  响应不是 JSON(比如 Base URL 填成了某个网页)或 200 里带 `error`(部分网关这样报错)时仍然判为失败。
- 两个 adapter 的 `testConnection()` 改为直接发请求,非 2xx 走原来的 `errorFromResponse()`,
  2xx 交给 `assertProbeBody()`。
- `complete()` 不变,翻译路径上空内容依旧报错。

## 验证

- OpenAI 新增 3 个用例:null content 判为通过;200 带 `error` 判为失败并带出原始信息;
  非 JSON 的 200 判为 `bad_response`。
- Anthropic 新增 2 个用例:`content: null` 判为通过;`type: "error"` 的 200 判为失败。
- 修复前 5 个用例全红,修复后全量 258 个单测通过,`tsc --noEmit` 无报错。
- 新增端到端测试 `e2e/model-test.spec.ts`:在加载了真实扩展的 Chromium 里打开设置页,
  对 4 个 Model 点「测试模型」。mock 服务(`e2e/mock-llm.mjs`)新增两个模型 id:
  `mock-reasoning` 返回无文本的 200,`mock-error-200` 返回带 `error` 的 200。
  对未修复的构建运行时,OpenAI 推理模型卡片显示 `Response contained no message content`(红);
  修复后普通模型和两种协议的推理模型都显示已连接,`mock-error-200` 显示失败并带出原始信息(绿)。
  全部 8 个 Playwright 用例通过。

## 有意留白

- 测试仍然发送 `max_tokens: 1`。OpenAI 官方的 o 系列和 gpt-5 不接受 `max_tokens`
  (要求 `max_completion_tokens`),对这些模型测试会得到 400,而翻译不传该参数所以能用。
  这是另一种误报,已在 [0005](./0005-o-series-rejects-max-tokens.zh-CN.md) 修复。
