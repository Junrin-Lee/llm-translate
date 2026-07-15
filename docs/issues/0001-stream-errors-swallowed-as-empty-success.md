# 0001 — Stream errors swallowed as empty success ("Translating…" forever)

**English** · [简体中文](./0001-stream-errors-swallowed-as-empty-success.zh-CN.md)

- **Reported:** 2026-07-15, during the Image Translation smoke pass (item 6: non-vision model via a gateway combo)
- **Status:** Fixed — `b6c362b`, `1cec2f5`, `e3fd7b5` (branch `feat/image-translation`)
- **Blast radius:** all three features (Selection / Page / Image Translation share the adapters); Image Translation was merely the first to hit it

## Symptom

Image Translation routed to a model without image support (gateway combo `my-deepseek-flash`). The gateway exhausted all upstreams in ~20 s and reported the failure — yet the result card stayed on "Translating…" forever. No error, Retry looped the same way.

## Root cause

Three stacked defects; the first two form the bug, the third is a related exposure found on the way.

1. **SSE error frames were silently swallowed (trigger).** The gateway responds to `stream: true` with `200 OK` + SSE, sends `: omniroute-keepalive` comments while it tries upstreams, then emits the failure as a standard SSE event and closes the stream:

   ```
   event: error
   data: {"error":{"message":"[openrouter/deepseek/deepseek-v4-flash] [404]: No endpoints found that support image input (reset after 2m)"}}
   ```

   `parseSse` parsed this event faithfully — but both adapters' consume loops only looked for delta content (`choices[0].delta.content` / `content_block_delta`) and `continue`d past everything else, including error frames. Anthropic's *documented* stream-error shape is the same `event: error` pattern, so the official API was equally affected. The stream then closed with zero deltas and `stream()` returned `{ text: '' }` — a hard failure reported upward as an empty success, so the handler emitted `done` and no error ever existed on the wire.

2. **UI rendered done-but-empty as in-progress.** Both result panels rendered `{output || "Translating…"}` — using "is there text" as a proxy for "is it still running". `status === 'done'` with empty output therefore displayed exactly like an active translation, disguising defect 1 as an eternal spinner.

3. **No timeout after headers (related exposure, not the trigger here).** `fetchWithTimeout` clears its timer the moment response headers arrive, leaving SSE reads and `errorFromResponse`'s `res.text()` with no timeout at all. A gateway that holds a connection open would hang a translation forever. Proven by reproduction tests; this gateway closes its streams, so it did not fire in this incident.

## Evidence chain

1. **Elimination from observed behavior:** no headers → the 60 s header timeout would have fired (it didn't); a 404 with a closed body → immediate `not_found` error (didn't happen); 200 SSE closed cleanly with content → normal result (didn't happen).
2. **Gateway probe:** `curl -N` against the same endpoint/payload returned `200` in 19.2 s with a **closed** stream — ruling the hang exposure out as the trigger.
3. **Byte-level capture** of the stream body showed the keepalive comments + `event: error` frame verbatim (quoted above) — confirming the swallowed-frame path end to end.
4. **Failing tests first:** the exact captured frame reproduced the swallow in both adapters (5 red tests), and never-closing-body responses reproduced the hang (3 red tests that timed out precisely like production).

## Fix

| Commit | Layer | Change |
|---|---|---|
| `b6c362b` | adapters | Stream loops surface `event: error` / `{"error": …}` payloads as `LlmError('server', <provider message>)`; a stream that closes with zero content now fails as `bad_response` instead of succeeding empty (stream paths only — `complete()` untouched so `testConnection`'s 1-token probe cannot regress). |
| `1cec2f5` | http | `withIdleTimeout` stall watchdog: body reads fail with `code=timeout` after 30 s of silence (keepalives reset the clock); unclosed error bodies give up after the same window and fall back to the status-only message. |
| `e3fd7b5` | UI | Both panels render "Translating…" only while `status === 'streaming'`; done-but-empty shows an explicit empty-result hint (new `panelEmptyResult` key, EN/ZH). |

After the fix, the smoke-item-6 scenario shows the gateway's original error message in the card ~20 s in (gateway-side latency), plus the existing vision-model guidance and the Routing deep-link.

## Verification

- 8 new adapter tests (error frames incl. the verbatim gateway capture, empty streams, stalled streams/bodies); suite 210/210, typecheck/lint clean.
- Manual re-verification owner: smoke item 6 on the live gateway.

## Left open (deliberately)

- `complete()`'s happy-path `res.json()` has the same theoretical post-headers exposure as defect 3; not wired to the watchdog in this pass to keep the change minimal.
