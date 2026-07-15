# Privacy Policy — LLM Translate

**English** · [简体中文](./privacy-policy.zh-CN.md)

_Last updated: 2026-07-14_

LLM Translate is a browser extension for selection, full-page, and screenshot translation.
It is **bring-your-own-key (BYOK)**: you supply your own OpenAI-compatible or
Anthropic-compatible API key, and the extension talks directly to the endpoint
**you** configure. There is no account, no backend operated by us, and no
telemetry.

## Summary

- We (the developer) operate **no server** and **receive no data** from you.
- All settings and API keys are stored **locally on your device** and are never
  synced or transmitted anywhere except as described below.
- The only outbound network requests go to the **translation API endpoint you
  configure**, and only carry the text you chose to translate.

## What the extension stores, and where

All data lives in your browser's local extension storage (`chrome.storage.local`)
on your own device. Nothing is stored on a remote server.

- **Provider profiles** — protocol, Base URL, model, optional parameters, and the
  **API key** you enter. Keys are stored locally and are **never synced** across
  devices.
- **Preferences** — target language, interface language, selection trigger, page
  display mode, and per-site rules (auto-translate / disable lists).
- **Prompt overrides** — any custom prompt templates you set.
- **Translation cache** — recent translations, kept locally to avoid re-translating
  the same text (selection results in session storage, page results in local
  storage). You can clear it at any time from the settings page.

## What is sent over the network

When you translate a selection or a page, the extension's background service
worker sends the following **directly to the API endpoint you configured**:

- the **text you chose to translate**, and
- your **API key**, as the standard authorization header
  (`Authorization: Bearer …` for OpenAI-compatible endpoints, or `x-api-key: …`
  for Anthropic-compatible endpoints).

These requests go **only** to the Base URL you entered. The extension makes no
other network requests. It does not send analytics, usage statistics, crash
reports, or any identifying information to us or to any third party.

Because you choose the endpoint, the text you translate is subject to the privacy
policy of **your chosen provider** (for example OpenAI or Anthropic). Please
review that provider's policy to understand how they handle the content you send.

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
