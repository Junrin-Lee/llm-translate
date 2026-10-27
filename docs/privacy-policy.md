# Privacy Policy — LLM Translate

**English** · [简体中文](./privacy-policy.zh-CN.md)

_Last updated: 2026-10-27_

LLM Translate is a browser extension for selection, full-page, screenshot, and text translation,
with an optional Selection Search.
It is **bring-your-own-key (BYOK)**: you supply your own OpenAI-compatible or
Anthropic-compatible API key, and the extension talks directly to the endpoint
**you** configure. There is no account, no backend operated by us, and no
telemetry.

## Summary

- We (the developer) operate **no server** and **receive no data** from you.
- All settings and API keys are stored **locally on your device** and are never
  synced or transmitted anywhere except as described below.
- The only outbound network requests go to the **API endpoint you configure**, and
  carry only the text (or screenshot region) a feature you used or enabled sends;
  see [When text is sent](#when-text-is-sent).

## What the extension stores, and where

All data lives in your browser's local extension storage (`chrome.storage.local`)
on your own device. Nothing is stored on a remote server.

- **Providers and model profiles** — protocol, Base URL, the **API key** you enter,
  model names, and optional parameters. Keys are stored locally and are **never
  synced** across devices.
- **Preferences** — target language, interface language, selection trigger, the
  Selection Search switch, page display mode, and per-site rules (auto-translate /
  disable lists).
- **Prompt overrides** — any custom prompt templates you set.
- **Translation cache** — recent translations, kept locally to avoid re-translating
  the same text. Selection results live in session storage and are gone when the
  browser closes. Page results live in local storage for up to **7 days**, then
  stop being used and are deleted on the next write. Selection Search answers are
  never cached. You can clear the cache at any time from the settings page.

## What is sent over the network

When a feature runs, the extension's background service worker sends the following
**directly to the API endpoint you configured**:

- the **text the feature works on** (see below), and
- your **API key**, as the standard authorization header
  (`Authorization: Bearer …` for OpenAI-compatible endpoints, or `x-api-key: …`
  for Anthropic-compatible endpoints).

These requests go **only** to the Base URL you entered. The extension makes no
other network requests. It does not send analytics, usage statistics, crash
reports, or any identifying information to us or to any third party.

Because you choose the endpoint, the text you translate is subject to the privacy
policy of **your chosen provider** (for example OpenAI or Anthropic). Please
review that provider's policy to understand how they handle the content you send.

If you enter a Base URL that uses plain `http://` to a host other than your own
machine, the API key and the text travel unencrypted; the settings page warns you
when it sees one.

### When text is sent

- **Selection translation** — the selected text, when you click the icon, use the
  shortcut or context menu, or right away if you chose "Translate instantly".
  Selections inside input fields, text areas and editable areas are ignored.
- **Page translation** — the readable text of the page, when you start it. On
  sites you marked as **auto-translate**, this happens automatically each time you
  visit, and continues as new content loads or the site changes route.
- **Text translation** (toolbar popup) — the text you type or paste: pasted text
  is sent at once, typed text 2 seconds after your last keystroke. Anything pasted
  there by mistake is sent too.
- **Selection Search** (off by default) — the selected text, when you click the
  search icon, together with an instruction asking the model to search the web.
  If your provider's model can browse, the provider may pass the text to its own
  search services, which are covered by the provider's policy, not by this
  extension. Links in the answer open third-party sites only when you click them,
  in a new tab and without sending the referring page.

## Screenshot Translation

- The capture region you select is sent **only** to the API endpoint configured
  for Screenshot Translation (its Feature Override, or the Global Default Provider) —
  the same kind of destination used by Selection and Page translation.
- Nothing about the capture is persisted: it is never written to disk and never
  cached. The in-memory hand-off used when the feature falls back to an
  extension page (`storage.session`) is cleared automatically when the browser
  closes.
- The first time you use Screenshot Translation, a one-time notice tells you the
  capture will be sent to your configured endpoint; once acknowledged, it does
  not appear again.

## Extension UI on web pages

- The selection popup, search answers, the page toolbar and the screenshot crop
  view are drawn inside a **closed shadow root**, so the web page's own scripts
  cannot read them.
- Page translation writes translations into the page itself (that is how they
  appear next to the original), so the page's own scripts can see them.

## What we collect

**Nothing.** The developer does not collect, receive, store, sell, or share any
of your data. There is no server to collect it.

## API key handling

- Keys are stored locally and used only to authenticate the requests you trigger.
- Keys are **never** written to logs, error messages, or diagnostic output.
- Exporting your settings **excludes API keys by default**; keys are included only
  if you explicitly opt in, with an on-screen warning that the file will contain
  them in plain text.

## Permissions

The extension requests the minimum permissions needed to work; see
[permission justifications](../store-assets/justifications.md) for the rationale
behind each one.

## Changes to this policy

If this policy changes, the "Last updated" date above will change and the new
version will be published in this repository.

## Contact

Questions or concerns: please open an issue at
<https://github.com/Junrin-Lee/llm-translate/issues>.
