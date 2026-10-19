# 0004 — Model test reports "no content" even though the request succeeded

**English** · [简体中文](./0004-model-test-fails-with-no-content.zh-CN.md)

- **Reported:** 2026-10-19, while configuring a Model Profile
- **Status:** Fixed
- **Verified by:** 5 new unit tests and 1 end-to-end test (all red before the fix, green after); full unit suite, typecheck and e2e rerun

## Symptom

Clicking "Test model" on a Model card shows a failure even though the server answered 200. The
message is `Response contained no message content` (OpenAI protocol) or
`Response contained no content` (Anthropic protocol). Translating with the same model works.

## Root cause

`testConnection()` reused the translation path's `complete()` with `max_tokens` set to 1.
`complete()` requires text in the response: a string at `choices[0].message.content` for OpenAI,
an array at `content` for Anthropic.

With a 1-token budget, reasoning models (DeepSeek-R1, Qwen3, GLM thinking models, and similar
models behind compatible gateways) spend the token on reasoning and return `content: null` with
`finish_reason: "length"`. `complete()` treats that as `bad_response`, so a successful
connectivity probe was reported as a failure.

Translation does not send `max_tokens` unless the user set one, so the model can answer normally
and only the test breaks.

## Evidence

1. The `test-model` branch in `src/messaging/handler.ts` calls `createClient(...).testConnection()`.
2. `testConnection()` in `src/llm/openai.ts` and `src/llm/anthropic.ts` ran
   `complete({ user: 'ping', maxTokens: 1 })`.
3. `complete()` throws `LlmError('bad_response', 'Response contained no ... content')` when the
   content is missing.
4. A unit test feeding a 200 response of
   `{ choices: [{ message: { content: null }, finish_reason: 'length' }] }` made
   `testConnection()` return `ok: false` before the fix, matching what the user saw.

## Fix

The test answers three questions: is the endpoint reachable, is the key valid, does the model id
exist. The reply's content is not part of that.

- `src/llm/http.ts` adds `assertProbeBody()`. A 2xx passes when the body is a JSON object with no
  `error` field. A non-JSON body (the base URL points at a web page) or a 200 carrying `error`
  (some gateways report failures this way) still fails.
- Both adapters' `testConnection()` now send the request directly. Non-2xx responses go through
  the existing `errorFromResponse()`, and 2xx responses go through `assertProbeBody()`.
- `complete()` is unchanged, so empty content still fails on the translation path.

## Verification

- OpenAI: 3 new cases. Null content passes; a 200 with `error` fails and carries the provider's
  message; a non-JSON 200 fails as `bad_response`.
- Anthropic: 2 new cases. `content: null` passes; a 200 with `type: "error"` fails.
- All 5 cases failed before the fix. After it, all 258 unit tests pass and `tsc --noEmit` is clean.
- New end-to-end test `e2e/model-test.spec.ts` opens the settings page in Chromium with the real
  extension loaded and clicks "Test model" on 4 models. The mock server (`e2e/mock-llm.mjs`) gains
  two model ids: `mock-reasoning` answers 200 with no text, and `mock-error-200` answers 200 with an
  `error` body. Against the unfixed build, the OpenAI reasoning card showed
  `Response contained no message content` (red). After the fix, the plain model and the reasoning
  models on both protocols show as connected, and `mock-error-200` fails with the provider's
  message (green). All 8 Playwright specs pass.

## Left open on purpose

- The test still sends `max_tokens: 1`. OpenAI's own o-series and gpt-5 models reject
  `max_tokens` (they require `max_completion_tokens`), so testing them returns 400 while
  translation, which omits the parameter, works. That is a separate false negative and is not
  handled here.
