# Provider 配置的 name 是可选展示标签,而非身份键

[English](./0004-provider-profile-name-optional.md) · **简体中文**

Provider 配置在所有关键处都通过 `id`(生成的 UUID)引用——`defaults.global`、功能级覆盖、`resolveProfile()` 全部按 `id` 匹配,从不按 `name`。`name` 字段纯粹是面向用户的展示标签:选项页允许保存 name 为空的配置,翻译功能不受影响。因此 `src/storage/import-export.ts` 的导入校验不再要求 `name` 为非空字符串,仅 `id`、`baseUrl`、`model` 保持必填。这修复了一个往返不对称问题:name 为空的配置可以创建、保存、导出,却在导入时报 `Provider field "name" must be a non-empty string`。

## Consequences

- `name` 的导入导出对称:凡是应用能导出的,都能再导回来。
- `id` 仍是唯一绑定键,导入时必须非空——无 id 的配置无法被默认项或功能级覆盖引用。
- `baseUrl` 与 `model` 导入时仍必填:缺失它们的配置无法完成翻译。name 为空无害,endpoint 或 model 为空有害。对半成品配置做完全无损往返,是另一个独立决策。

## Amendment (ADR-0007)

ADR-0007 把扁平配置拆成两条,同一条规则现在按类型分别适用。`name` 在 `LlmProvider` 与 `ModelProfile` 上都仍是可选展示标签。`LlmProvider` 必填 `id` 与 `baseUrl`;`ModelProfile` 必填 `id`、`providerId` 与 `model`。`apiKey` 保持可选,这样抹掉 key 的导出文件仍能导回来。原决策不变:绑定键是 `id`,`name` 永远不参与身份。
