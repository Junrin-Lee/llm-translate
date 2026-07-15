# AMO reviewer notes (paste into "Notes to Reviewer")

Build environment: Node >= 20.19, pnpm 9.15.9 (pinned via package.json packageManager).

Reproduce the submitted xpi from the sources zip:

    pnpm install --frozen-lockfile
    pnpm zip:firefox
    # output: .output/llm-translate-<version>-firefox.zip

This repo is pnpm-only. `pnpm-lock.yaml` is the single authoritative lockfile;
please ignore any stray `package-lock.json` and do not run `npm install`.

The extension has no backend and no bundled remote code. All translation traffic
goes directly from the extension to the LLM endpoint the user configures
(OpenAI- or Anthropic-compatible). `<all_urls>` host permission: the content
script provides selection/page translation on any site, and the background
fetches the user-configured endpoint (see docs/adr/0001 in the sources zip).
`activeTab` permission: Screenshot Translation captures the current tab via
`captureVisibleTab` only when the user explicitly triggers it, which also keeps
that feature working after the optional `<all_urls>` access is revoked (ADR-0006).
