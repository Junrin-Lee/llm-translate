# LLM Translation Browser Extension

**English** · [简体中文](./CONTEXT.zh-CN.md)

A browser extension built for release to the Chrome Web Store / Edge Add-ons / Firefox Add-ons (AMO): it provides three features — Selection Translation, Page Translation, and Screenshot Translation. Its translation capability comes entirely from the user's own LLM API (an OpenAI-compatible or Anthropic-compatible protocol) — no self-hosted backend, no account system.

## Language

### Translation features

**Selection Translation (划词翻译)**:
The instant translation triggered after a user selects a span of text on a web page; the result is shown in place as a popover. Depending on the shape of the selection, it outputs either a Dictionary Card or a Translation Card.
_Avoid_: word-capture translation, hover translation, word lookup

**Dictionary Card (词典卡片)**:
The dictionary-style result that Selection Translation outputs when the selection is judged to be a word or phrase: phonetics, part of speech, multiple senses, example sentences.
_Avoid_: lookup result, word card

**Translation Card (译文卡片)**:
The plain-translation result that Selection Translation outputs when the selection is a sentence or paragraph; Screenshot Translation streams its result in the same form.
_Avoid_: translation result box

**Selection Search (划词搜索)**:
An opt-in companion to Selection Translation: when enabled and the trigger is the icon, a search icon sits to the right of the translate icon. Clicking it opens the same popover on a Search tab, where the resolved model answers about the selected text in the target language (searching the web itself if the model can) as rendered Markdown. Results are never cached.
_Avoid_: AI lookup, explain, web search

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

**Screenshot Translation (截屏翻译)**:
Translation of the text inside a single image the user supplies — primarily by dragging a capture region on the current tab (on pages where the content script cannot run, e.g. the built-in PDF viewer, it automatically falls back to capturing the visible area and cropping inside an extension page), or by pasting / uploading an image. The result streams as a Translation Card. Requires the resolved Model Profile's model to accept image input.
_Avoid_: image translation, OCR translation, picture translation

### Provider

**LLM Provider (接入点)**:
One saved connection to an LLM endpoint: a Protocol, a Base URL and an API Key, plus an optional default timeout. It carries no model name, and several Model Profiles can share one. The name is an optional display label; each provider is referenced internally by a stable id, so a provider with no name still works.
_Avoid_: provider profile, translation engine, vendor, channel, account

**Model Profile (模型配置)**:
A named choice of one model on one LLM Provider, plus optional parameters (temperature, max tokens, timeout). This is the unit routing points at, and the unit a user adds when they want the same endpoint with a different model. Its own timeout wins over the provider's default.
_Avoid_: translate model, model entry, provider profile

**Protocol (协议类型)**:
The API shape an LLM Provider follows; there are only two: OpenAI-compatible, Anthropic-compatible.
_Avoid_: vendor type, interface type

**Global Default Model (全局默认模型)**:
The Model Profile that every translation feature actually uses when it is not overridden at the feature level.
_Avoid_: current engine, active profile, global default provider

**Feature Override (功能级覆盖)**:
A Model Profile specified separately for Selection Translation, Page Translation, Screenshot Translation, or Selection Search; once set, it takes precedence over the Global Default Model, and when unset it follows the global one. Selection Search is the exception: unset, it follows Selection Translation's override first.
_Avoid_: standalone config, per-channel

### Permissions

**Permission Onboarding (权限引导)**:
The flow that gets a user to grant the extension site access when the browser has not granted it — Firefox treats site access as optional and revocable, so the extension can find itself installed but unable to act. It spans a lightweight onboarding page opened right after install, warning banners in the popup and the settings page, and hints at every other entry point. Without site access, neither Selection Translation nor Page Translation can run.
_Avoid_: permission warning, authorization flow

## Example dialogue

> **Dev**: After a user selects text, which model handles it?
> **Expert**: First check whether Selection Translation has a Feature Override — if so, use the Model Profile that override specifies; if not, use the Global Default Model.
> **Dev**: So does an "LLM Provider" store a vendor? Like DeepSeek?
> **Expert**: Not a vendor — it's one connection. DeepSeek's official endpoint and a DeepSeek proxied through the company gateway are two different LLM Providers, and both have the Protocol OpenAI-compatible.
> **Dev**: I want deepseek-chat and deepseek-reasoner on that same gateway. Two providers?
> **Expert**: One LLM Provider, two Model Profiles pointing at it. The Base URL and API Key are stored once, so rotating that key covers both.
> **Dev**: Screenshot Translation says "the model does not support image input" — now what?
> **Expert**: The Model Profile it resolved to (its Feature Override, or the Global Default Model) names a model without vision. Set a Feature Override for Screenshot Translation that points at a Model Profile whose model accepts images.
