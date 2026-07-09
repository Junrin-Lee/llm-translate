# LLM Translation Browser Extension

**English** · [简体中文](./CONTEXT.zh-CN.md)

A browser extension built for release to the Chrome Web Store / Edge Add-ons / Firefox Add-ons (AMO): it provides two features, Selection Translation and Page Translation. Its translation capability comes entirely from the user's own LLM API (an OpenAI-compatible or Anthropic-compatible protocol) — no self-hosted backend, no account system.

## Language

### Translation features

**Selection Translation (划词翻译)**:
The instant translation triggered after a user selects a span of text on a web page; the result is shown in place as a popover. Depending on the shape of the selection, it outputs either a Dictionary Card or a Translation Card.
_Avoid_: word-capture translation, hover translation, word lookup

**Dictionary Card (词典卡片)**:
The dictionary-style result that Selection Translation outputs when the selection is judged to be a word or phrase: phonetics, part of speech, multiple senses, example sentences.
_Avoid_: lookup result, word card

**Translation Card (译文卡片)**:
The plain-translation result that Selection Translation outputs when the selection is a sentence or paragraph.
_Avoid_: translation result box

**Page Translation (全文翻译)**:
Whole-page translation of the readable body text of the current web page; it has two display modes, Bilingual Mode and Translation-only Mode.
_Avoid_: webpage translation, immersive translation, full-page translation

**Bilingual Mode (双语对照)**:
The default display mode of Page Translation: each translated block is inserted below its corresponding source block, and the original text is kept.
_Avoid_: comparison mode, stacked comparison

**Translation-only Mode (仅译文)**:
An optional display mode of Page Translation: the translation replaces the original text in place; the original is hidden but can be restored with one click.
_Avoid_: replace mode

**Auto-translate Site (自动翻译站点)**:
A domain the user has marked as "always translate"; visiting its pages automatically triggers Page Translation.
_Avoid_: whitelist, auto site

### Provider

**Provider Profile (Provider 配置)**:
A named configuration for connecting to a translation service, made up of a Protocol, Base URL, API Key, model name, and optional parameters. Users can save several. The name is an optional display label chosen by the user; each profile is referenced internally by a stable id, so a profile with no name still works.
_Avoid_: translation engine, vendor, channel, account

**Protocol (协议类型)**:
The API shape a Provider Profile follows; there are only two: OpenAI-compatible, Anthropic-compatible.
_Avoid_: vendor type, interface type

**Global Default Provider (全局默认 Provider)**:
The Provider Profile that every translation feature actually uses when it is not overridden at the feature level.
_Avoid_: current engine, active profile

**Feature Override (功能级覆盖)**:
A Provider Profile specified separately for Selection Translation or Page Translation; once set, it takes precedence over the Global Default Provider, and when unset it follows the global one.
_Avoid_: standalone config, per-channel

### Permissions

**Permission Onboarding (权限引导)**:
The flow that gets a user to grant the extension site access when the browser has not granted it — Firefox treats site access as optional and revocable, so the extension can find itself installed but unable to act. It spans a lightweight onboarding page opened right after install, warning banners in the popup and the settings page, and hints at every other entry point. Without site access, neither Selection Translation nor Page Translation can run.
_Avoid_: permission warning, authorization flow

## Example dialogue

> **Dev**: After a user selects text, which model handles it?
> **Expert**: First check whether Selection Translation has a Feature Override — if so, use the Provider Profile that override specifies; if not, use the Global Default Provider.
> **Dev**: So does a "Provider Profile" store a vendor? Like DeepSeek?
> **Expert**: Not a vendor — it's a connection configuration. DeepSeek's official endpoint and a DeepSeek proxied through the company gateway can be two different Provider Profiles, and both have the Protocol OpenAI-compatible.
