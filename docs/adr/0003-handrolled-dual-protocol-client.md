# Hand-rolled lightweight dual-protocol client, no openai / @anthropic-ai/sdk

**English** · [简体中文](./0003-handrolled-dual-protocol-client.zh-CN.md)

`src/llm/` uses native fetch + a hand-rolled SSE parser to implement two adapters, OpenAI-compatible and Anthropic-compatible, without depending on the official SDKs. Rationale: the core abstraction of this product is "two protocols, symmetric and interchangeable"; the official SDKs each carry their own asymmetric types and retry semantics, so wrapping them into a unified interface costs no less than building our own; the extension is sensitive to bundle size (the content script is resident on all pages); and under the MV3 service worker environment a hand-rolled fetch has zero adaptation cost. The translation use case only uses one chat endpoint plus one model-list endpoint per protocol, so the API surface is extremely small and stable.

## Consequences

- Protocol evolution (new fields, new streaming event types) has to be tracked ourselves, and SSE parsing and error normalization must have solid unit tests (already listed as a testing priority).
- If SDK-level advanced capabilities (tool calling, structured output, etc.) are needed in the future, we can re-evaluate introducing them locally, without affecting the adapter interface.
