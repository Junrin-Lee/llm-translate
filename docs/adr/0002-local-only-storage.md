# 所有用户数据仅存 `storage.local`,不使用 `storage.sync`

API Key、Provider 配置、站点清单、Prompt 覆盖等全部数据只存本机 `storage.local`,跨设备迁移靠 JSON 导入/导出(导出默认不含 Key)。放弃 `storage.sync` 的多设备便利,换取最干净的隐私叙事:隐私政策可以声明"所有数据不离开本机,唯一网络请求是发往用户自己配置的 API 端点"——`storage.sync` 会把数据明文送入 Google 账号同步管道,对以隐私为卖点的 BYOK 扩展是负资产。

## Consequences

- 换设备/重装需要手动导入配置或重填 Key,设置页需把导入/导出做得显眼。
- 未来若要引入 sync,只能同步非敏感配置且属于破坏此决策的变更,需重新评估隐私政策。
