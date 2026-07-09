# AMO reviewer notes (paste into "Notes to Reviewer")

Build environment: Node >= 20.19, pnpm 9.15.9 (pinned via package.json packageManager).

Reproduce the submitted xpi from the sources zip:

    pnpm install --frozen-lockfile
    pnpm zip:firefox
    # output: .output/llm-translate-<version>-firefox.zip

The extension has no backend and no bundled remote code. All translation traffic
goes directly from the extension to the LLM endpoint the user configures
(OpenAI- or Anthropic-compatible). `<all_urls>` host permission: the content
script provides selection/page translation on any site, and the background
fetches the user-configured endpoint (see docs/adr/0001 in the sources zip).
