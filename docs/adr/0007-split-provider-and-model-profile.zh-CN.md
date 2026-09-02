# 把扁平的 Provider 配置拆成 LLM Provider 与模型配置

[English](./0007-split-provider-and-model-profile.md) · **简体中文**

到 v0.3.0 为止,一条 `ProviderProfile` 记录同时装了三样互不相干的东西:连接(协议类型、Base URL、API Key)、模型选择,以及那个模型的参数。于是想在同一个 OpenAI 兼容网关下用两个模型的用户,必须建两条完整配置、把同样的 Base URL 和 API Key 重填一遍;换 key 时还得逐条改过去。现在存储层是两条记录 —— `LlmProvider` 管连接,`ModelProfile` 管"在哪条连接上用哪个模型" —— 且 `defaults.global` 与各功能级覆盖指向的是 `ModelProfile.id`。运行时形态不拆:`resolveProfileFrom()` 把 provider 与 model join 成一个扁平的 `ResolvedProfile`(即旧的 `ProviderProfile`,只是改了名),因此 ADR-0003 的两个手写适配器拿到的输入与今天完全一致。我们否决了成本更低的"复制此配置"按钮:它省掉了重填,但省不掉 key 轮换,而且随着翻译功能增加,配置条数只会继续翻倍。我们同样否决了让 v1 → v2 迁移自行合并 provider,理由见下。

## Consequences

- `defaults.*` 绑定 `ModelProfile.id`,绝不绑定 provider id。让路由指向连接,就无法在同一个网关下给划词翻译配便宜模型、给全文翻译配强模型,而这正是拆分的全部动机。
- 拆分只落在存储层。`src/llm/` 看到的仍是一个扁平的 `ResolvedProfile`,不知道它由两条记录拼成,所以协议适配器、重试包装和它们的测试都不引入新概念。
- v1 → v2 迁移是无损的 1:1 展开,**完全不做去重**:每条扁平配置变成一个 provider 加一个 model,即使多条配置在协议类型、Base URL、API Key 上完全相同也照样各建一份。自动合并的风险是把两个恰好共用同一端点的账号收拢到一个凭据上,计费与限流会静默地打到错误的 key 上。收敛改为设置页里一个显式动作,合并键是这三个字段全等,由用户自己确认。
- 迁移出的 `ModelProfile` 沿用 v1 配置的 `id`。`defaults` 里已经存下的所有 id 因此依然有效,迁移代码从不触碰路由。
- `temperature`、`maxTokens`、`timeoutMs` 归 `ModelProfile`。`LlmProvider.timeoutMs` 只是连接级默认值,被模型自己的取值覆盖。把参数上提到 provider,会让同一连接下的两个模型无法配不同 temperature,等于在上一层重现原来的抱怨。
- 连接自检与模型自检是两个独立探测:`test-provider` 打模型列表接口,判断鉴权与可达;`test-model` 发一次 `max_tokens: 1` 的 completion。合成一个测试会让"模型名写错"和"key 失效"互相冒充,报错于是指向错误的字段。
- `listModels` 不再吞掉自己的异常。鉴权失败时返回 `[]`,会让设置页显示"未返回模型,请手动填写模型名",把用户带离真正的问题。现在空数组只表示这个端点确实没有模型,其余情况一律抛出。`list-models` 把失败报成 `error` 事件,因为用户是想要一份列表而没拿到;`test-provider` 把同一个失败报成 `ok: false` 的 `test-result`,因为"不行"是它被问的那个问题的有效答案。
- 只要还有 `ModelProfile` 引用某条 `LlmProvider`,删除该 provider 就被拦住,而不是级联删除。级联会让用户在连接上点一下,就毁掉一批他花时间配好的模型配置。
- 导入时,`providerId` 在同一份文件里找不到对应 provider 的 `ModelProfile` 会被拒绝,错误信息点名是哪条模型。静默接受孤儿只是把失败推迟到下一次翻译,而那时能解释它的上下文已经全都不在了。
- ADR-0004 关于 `name` 的结论依然成立,只是现在按类型分别适用。见该文档中追加的修订段。
