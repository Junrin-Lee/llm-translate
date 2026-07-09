# Firefox release smoke checklist

**English** · [简体中文](./firefox-smoke.zh-CN.md)

Run before every AMO submission, on the latest Firefox release, with the zip from `pnpm zip:firefox` temp-installed via about:debugging (or the signed build).

## Install & permission
- [ ] Fresh install with site access granted: no onboarding page opens, no toolbar badge.
- [ ] Fresh install with site access declined: onboarding opens automatically; grant button works; page flips to the success state.
- [ ] Revoke site access in about:addons: toolbar shows the red "!" badge; popup and settings show the warning banner.
- [ ] Grant from the popup banner: banner disappears without reopening; badge clears.
- [ ] Keyboard shortcut / context menu on any page while unauthorized: onboarding page opens (or is focused if already open).

## Core features (mirror of the Chromium e2e)
- [ ] Selection Translation: instant trigger streams a Translation Card; word selection renders a Dictionary Card.
- [ ] Page Translation via toolbar popup: Bilingual Mode inserts translations below source blocks; Translation-only Mode replaces and restores.
- [ ] Context menu entries translate page / selection; menu title flips to "Restore original" after translating.
- [ ] Shortcuts Ctrl+Shift+S / Ctrl+Shift+P work (rebindable at about:addons → gear → Manage Extension Shortcuts).
- [ ] Options: provider CRUD, test connection against a real endpoint, import/export round-trip, cache panel clears both caches.

## Firefox-specific
- [ ] `storage.session` selection cache survives within the session and is gone after a full browser restart.
- [ ] Streaming works on a page served over https (background fetch through host permission, no CORS failures).
- [ ] Popup renders correctly (no scrollbar/clipping differences vs Chrome).
