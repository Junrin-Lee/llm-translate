# Firefox ships Manifest V3, paired with full-coverage Permission Onboarding

**English** · [简体中文](./0005-firefox-mv3-with-permission-onboarding.zh-CN.md)

Adding Firefox (Gecko) support for release on AMO meant choosing a manifest version, and the default path was MV2: WXT emits MV2 for the `firefox` target out of the box, Mozilla has no MV2 deprecation timeline, and MV2 grants `<all_urls>` unconditionally at install. We chose MV3 anyway, so all browsers share one manifest model and a published AMO listing never carries an MV2→MV3 migration debt. The cost is real: Firefox treats MV3 `host_permissions` as optional — a user can uncheck site access in the install dialog or revoke it later — and without `<all_urls>` both Selection Translation and Page Translation silently stop working. So the decision is a pair, not a single choice: MV3 **plus** Permission Onboarding on every surface (post-install onboarding page, popup/settings warning banners, runtime fallbacks from the context menu / shortcut / toolbar badge, and listing copy — see CONTEXT.md). Extension identity is pinned in `browser_specific_settings.gecko`: `id: llm-translate@junrin-lee.github.io` (immutable once listed on AMO) and `strict_min_version: 128.0` — the 2024 ESR, which guarantees the install dialog pre-checks the site-access grant (127+), `storage.session` (115+), and MV3 itself (109+).

## Consequences

- One manifest model across Chrome, Edge, and Firefox; `wxt.config.ts` must explicitly override WXT's MV2 default for the `firefox` target.
- Permission Onboarding is a product surface, not a Firefox-only patch: the same code runs on Chrome, where the site-access check is always true and the UI never shows. No browser-sniffing branches.
- Firefox below 128 is unsupported. Gecko forks (LibreWolf, Zen, Waterfox, …) inherit support through their underlying Gecko version but are not individually tested.
- Firefox runs MV3 backgrounds as event pages, not service workers — the Firefox build must declare `background.scripts`; background code stays event-driven and browser-agnostic.
- AMO review requires uploading a source zip with reproducible build instructions (`wxt zip -b firefox` generates it; the instructions must pin Node ≥ 20.19 and pnpm 9.15).
