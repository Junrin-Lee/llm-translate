# 0001 — 流内错误被吞成空成功(永远"翻译中…")

[English](./0001-stream-errors-swallowed-as-empty-success.md) · **简体中文**

- **报告时间:** 2026-07-15,图片翻译手工冒烟第 6 项(经网关 combo 使用非视觉模型)
- **状态:** 已修复 — `b6c362b`、`1cec2f5`、`e3fd7b5`(分支 `feat/image-translation`)
- **影响面:** 三个功能全部涉及(划词/全文/图片翻译共用适配器);图片翻译只是最先撞上

## 现象

图片翻译路由到不支持图片输入的模型(网关 combo `my-deepseek-flash`)。网关约 20 秒内试遍所有上游并报告失败——但结果卡片永远停在"翻译中…"。没有任何报错,点重试也只是同样循环。

## 根因

三层缺陷叠加;前两层构成本次 bug,第三层是排查途中证实的相关暴露。

1. **SSE error 帧被静默吞掉(触发点)。** 网关对 `stream: true` 请求先回 `200 OK` + SSE,尝试上游期间发 `: omniroute-keepalive` 注释心跳,最终把失败作为标准 SSE 事件发出后关闭流:

   ```
   event: error
   data: {"error":{"message":"[openrouter/deepseek/deepseek-v4-flash] [404]: No endpoints found that support image input (reset after 2m)"}}
   ```

   `parseSse` 把这个事件完整解析了出来——但两个适配器的消费循环只找增量内容(`choices[0].delta.content` / `content_block_delta`),对其余一切帧一律 `continue`,包括 error 帧。Anthropic **官方文档**的流错误正是同款 `event: error` 形态,官方 API 同样中招。流随后以零增量关闭,`stream()` 返回 `{ text: '' }`——一次硬失败被当作空成功上报,handler 发出 `done`,链路上从未存在过错误。

2. **UI 把"完成但为空"渲染成"进行中"。** 两个结果卡片都写着 `{output || "翻译中…"}`——用"有没有文字"冒充"是否还在跑"。于是 `status === 'done'` 且输出为空时,显示与进行中完全一致,把缺陷 1 伪装成永恒的转圈。

3. **headers 之后零超时(相关暴露,非本次触发)。** `fetchWithTimeout` 在响应 headers 到达的瞬间清除定时器,SSE 读取和 `errorFromResponse` 的 `res.text()` 完全没有超时。挂着连接不放的网关会让翻译永久悬挂。已用复现测试证明;本次网关会正常关流,故未实际触发。

## 证据链

1. **行为排除法:** headers 未回 → 60 秒头部超时会触发(未发生);404 且 body 正常关闭 → 立即 `not_found` 报错(未发生);200 SSE 携带内容正常关流 → 正常结果(未发生)。
2. **网关探测:** 用相同 endpoint/payload `curl -N`,19.2 秒返回 `200` 且流**正常关闭**——排除挂起暴露作为触发点。
3. **字节级抓流** 看到 keepalive 注释 + `event: error` 帧原文(如上引用)——端到端确认吞帧路径。
4. **失败测试先行:** 用抓到的原始帧在两个适配器复现吞帧(5 个红测试);用永不关闭的 body 复现挂起(3 个红测试,超时表现与生产完全一致)。

## 修复

| Commit | 层 | 变更 |
|---|---|---|
| `b6c362b` | 适配器 | 流循环把 `event: error` / `{"error": …}` 载荷抛为 `LlmError('server', <provider 原文>)`;零内容关闭的流按 `bad_response` 失败而非空成功(仅 stream 路径——`complete()` 不动,避免 `testConnection` 的 1-token 探测误伤)。 |
| `1cec2f5` | http | `withIdleTimeout` 空闲看门狗:body 读取静默 30 秒后以 `code=timeout` 失败(keepalive 会重置计时);不关闭的错误 body 同窗口放弃,回落到仅含状态码的消息。 |
| `e3fd7b5` | UI | 两个卡片仅在 `status === 'streaming'` 时显示"翻译中…";完成但为空显示明确的空结果提示(新增 `panelEmptyResult`,EN/ZH)。 |

修复后,冒烟第 6 项场景会在约 20 秒(网关侧耗时)后在卡片上看到网关原始错误信息,以及既有的视觉模型引导和 Routing 深链。

## 验证

- 新增 8 个适配器测试(error 帧含网关原始抓包、空流、挂起流/挂起错误体);全套 210/210,typecheck/lint 干净。
- 待人工复验:在真实网关上重跑冒烟第 6 项。

## 有意留白

- `complete()` 正常路径的 `res.json()` 存在与缺陷 3 同类的理论暴露;本次为控制改动面未接入看门狗。
