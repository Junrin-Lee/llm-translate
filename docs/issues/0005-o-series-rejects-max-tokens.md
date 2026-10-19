# 0005 — o-series and gpt-5 reject max_tokens, so the model test fails with 400

**English** · [简体中文](./0005-o-series-rejects-max-tokens.zh-CN.md)

- **Reported:** 2026-10-19, found while fixing 0004 and listed under its "Left open on purpose"
- **Status:** Fixed
- **Verified by:** 5 new unit tests and 1 new end-to-end case (red before the fix, green after); full unit suite, typecheck and e2e rerun

## Symptom

Clicking "Test model" on a Model card for OpenAI's o-series (o1, o3, o4-mini) or the gpt-5 family
shows a failure:

```
Request failed (400): Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
```

Translating with the same model works when no max-token cap is set. With a cap set under the
advanced parameters, translation fails with the same 400.

## Root cause

OpenAI's reasoning models do not accept `max_tokens`. They take `max_completion_tokens`, a cap that
covers both reasoning tokens and visible output. OpenAI answers 400 with `param: "max_tokens"` and
`code: "unsupported_parameter"`.

`buildBody()` in `src/llm/openai.ts` writes any cap into `max_tokens`. The model test always passes
`maxTokens: 1`, so it always sends the field. Translation sends it only when the user set
`params.maxTokens`.

Switching to `max_completion_tokens` everywhere is not an option: older models such as GPT-4, many
compatible gateways, and some Azure deployments do not know that field.

## Evidence

1. `testConnection()` calls `buildBody({ ..., maxTokens: 1 })`, so the body carries `max_tokens: 1`.
2. OpenAI returns the 400 above for o-series and gpt-5, and `errorFromResponse()` shows it on the card.
3. With `max_completion_tokens` and a tiny cap, OpenAI returns 200 with empty content and
   `finish_reason: "length"`. Since 0004 the test counts that as a pass, so resending with the new
   field name is enough.
4. The e2e mock gains a `mock-o-series` model that behaves this way. Against the unfixed build the
   card shows exactly this 400.

## Fix

In `src/llm/openai.ts`:

- When `postChat()` gets a 400, the request carried `max_tokens`, and the error body mentions
  `max_completion_tokens`, it resends once with the same cap under `max_completion_tokens`.
- The switch is recorded per endpoint and model in the module-level `completionTokenModels`. The
  background builds a new client for every request, so the record cannot live on the client. Kept
  in the module, it lets later requests use the new field directly instead of collecting a 400
  every time.
- Any other 400 is not retried. Its body goes to `errorFromResponse()` as before, so the original
  message is kept.
- Requests without a cap are left alone.

`src/llm/http.ts` exports `textWithTimeout()` so reading the 400 body keeps the stall timeout.

The fix covers both the model test and translation. A user-set cap keeps its value under the new
field name.

## Verification

- `tests/llm/openai.test.ts` adds 5 cases: the model test passes after the rename and retry; a
  user-set 512 carries over to `max_completion_tokens` when translating; after the switch the next
  client for the same endpoint and model uses the new field straight away; an unrelated 400 is not
  retried and keeps its message; a request without a cap is not retried. The first 3 were red
  before the fix.
- `e2e/model-test.spec.ts` adds a `mock-o-series` card. It showed the 400 on the unfixed build (red)
  and shows as connected after the fix (green).
- All 263 unit tests, `typecheck` and the 8 Playwright specs pass. Lint reports only the existing
  warning in `options/style.css`.
- Not verified against a real OpenAI key.

## Left open on purpose

- o-series and gpt-5 also reject a custom `temperature`. A user who sets one under the advanced
  parameters still gets a 400 from these models. Not handled here.
- The record lasts only as long as the background service worker and is not stored. After the
  worker is recycled, the first request for each such model still takes one 400 before the retry.
