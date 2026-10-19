# 0005 — o 系列和 gpt-5 拒收 max_tokens,测试模型报 400

[English](./0005-o-series-rejects-max-tokens.md) · **简体中文**

- **报告时间:** 2026-10-19,修 0004 时发现,记在 0004 的「有意留白」里
- **状态:** 已修复
- **修复验证:** 新增 5 个单元测试和 1 个端到端用例(先红后绿),全量单测、typecheck、e2e 重跑

## 现象

在 Model 卡片上对 OpenAI 的 o 系列(o1、o3、o4-mini)或 gpt-5 系列点「测试模型」,
界面显示失败:

```
Request failed (400): Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
```

不设最大 token 时,用同一个模型翻译没有问题。在高级参数里填了最大 token 数后,翻译也会报同样的 400。

## 根因

OpenAI 的推理模型不接受 `max_tokens`,要求改用 `max_completion_tokens`,这个上限同时计入推理 token
和可见输出。OpenAI 返回 400,错误体里 `param` 是 `max_tokens`,`code` 是 `unsupported_parameter`。

`src/llm/openai.ts` 的 `buildBody()` 只要有上限就写进 `max_tokens`。测试模型固定带 `maxTokens: 1`,
所以每次都会发这个字段;翻译只有在用户设置了 `params.maxTokens` 时才发。

不能一律改用 `max_completion_tokens`:GPT-4 一类的老模型、很多兼容网关和 Azure 的部分部署不认识这个字段。

## 证据链

1. `testConnection()` 调用 `buildBody({ ..., maxTokens: 1 })`,请求体里带 `max_tokens: 1`。
2. OpenAI 对 o 系列和 gpt-5 返回上面的 400,`errorFromResponse()` 把它原样显示在卡片上。
3. 改用 `max_completion_tokens` 后,上限太小时 OpenAI 返回 200、内容为空、`finish_reason: "length"`。
   0004 之后,测试遇到这种响应判为通过,所以只要换字段重发就够了。
4. e2e mock 新增 `mock-o-series`,行为与上面一致。对未修复的构建运行,卡片显示的正是这条 400。

## 修复

`src/llm/openai.ts`:

- `postChat()` 收到 400,而请求带了 `max_tokens`、错误体里提到 `max_completion_tokens` 时,
  把同一个上限改名为 `max_completion_tokens` 重发一次。
- 切换结果按 endpoint 加模型记在模块级的 `completionTokenModels` 里。后台每个请求都会新建 client,
  所以记录不能挂在 client 上;记在模块里,后续请求直接用新字段,不会每次先吃一个 400。
- 其他 400 不重试,错误体照旧交给 `errorFromResponse()`,原始报错信息不丢。
- 请求不带上限时什么也不改。

`src/llm/http.ts` 导出 `textWithTimeout()`,读 400 的错误体时同样有超时保护。

修复对测试模型和翻译都生效,用户设置的上限值保持不变,只换字段名。

## 验证

- `tests/llm/openai.test.ts` 新增 5 个用例:测试模型换字段重发后通过;翻译时用户设的 512 原样带到
  `max_completion_tokens`;同一 endpoint 和模型的下一个 client 直接用新字段;无关的 400 不重试且保留原始信息;
  请求不带上限时不重试。前 3 个修复前为红。
- `e2e/model-test.spec.ts` 新增 `mock-o-series` 卡片,未修复构建上显示 400(红),修复后显示已连接(绿)。
- 全量 263 个单测、`typecheck`、8 个 Playwright 用例通过,lint 只有原有的 `options/style.css` 警告。
- 没有用真实的 OpenAI key 验证。

## 有意留白

- o 系列和 gpt-5 也不接受自定义 `temperature`。用户在高级参数里填了温度,这些模型还是会 400,本次没处理。
- 切换记录只在后台 service worker 存活期间有效,不写入存储。worker 被回收重启后,
  每个这类模型的第一次请求仍会先收到一次 400 再重试。
