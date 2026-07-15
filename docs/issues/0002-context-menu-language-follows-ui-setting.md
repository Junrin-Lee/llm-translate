# 0002 — Context-menu items don't follow the browser language

**English** · [简体中文](./0002-context-menu-language-follows-ui-setting.zh-CN.md)

- **Reported:** 2026-07-15, during the Screenshot Translation smoke pass
- **Status:** Works as designed — user chose to keep the current behavior (no code change)
- **Decision owner:** maintainer, 2026-07-15

## Symptom

The extension's right-click submenu items ("翻译此页", "截屏翻译") rendered in Chinese inside an otherwise English browser context menu.

## Diagnosis

Not a missing-i18n bug. Menu titles go through the extension's shared `t()` layer, whose locale is driven by the **Interface language** setting (`general.uiLang`, [src/i18n/index.ts](../../src/i18n/index.ts)); `auto` resolves via `browser.i18n.getUILanguage()`. The screenshot's native menu showed **"Translate to English"** — Chrome only offers translating into the browser's own UI language, proving the browser UI language was English. Chinese menu titles therefore imply the Interface language setting was explicitly `zh`; the menu was faithfully following the extension-wide language preference, exactly like the popup, panels, and options page.

## Decision

Keep the current semantics: **context-menu titles follow the extension's Interface language setting**, consistent with every other surface. Users who want the menu to match the browser switch the setting to Automatic (the whole extension follows the browser language then).

Considered and declined for now: splitting surfaces so browser-native UI (context menu) always uses `getUILanguage()` while in-extension UI follows the setting. Revisit if mixed-language menus generate real user complaints; the change is small (a browser-locale `t` variant used only by the menu code in `background.ts`).
