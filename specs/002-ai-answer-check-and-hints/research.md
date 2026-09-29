# Research: AI Answer Check and Hint Credits

Sources read on 2026-09-30: Week 4 assignment, Week 4 session minutes, "Pouzdana AI
integracija" PDF, "Integracija AI API-ja" addendum PDF, the two tables in
`week4/image.png` and `week4/POSTodgovorAI.png`, and the Google/Vercel pages cited below.

## R1. SDK or plain REST

- **Decision**: plain `fetch` to
  `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`,
  key in the `x-goog-api-key` header.
- **Rationale**: the addendum warns that an SDK retrying internally makes telemetry say
  "1 attempt" while quota and latency show 3 (§12 "SDK retry koji se ne vidi"). The
  `@google/genai` README does not document its retry, timeout or abort behavior, so we could
  not prove it is off. With `fetch` every attempt is ours, `AbortSignal` works natively, the
  fake transport is simply an injected `fetch`, and no dependency is added. The key goes in a
  header, not the documented `?key=` query parameter, because URLs end up in logs.
- **Alternatives considered**: `@google/genai` (course example; rejected for the hidden-retry
  risk and one more dependency). An OpenAI adapter (out of scope: one provider).
- **Sources**: https://ai.google.dev/api/generate-content, https://github.com/googleapis/js-genai

## R2. Structured output

- **Decision**: `generationConfig: { responseMimeType: "application/json", responseJsonSchema,
  temperature: 0, maxOutputTokens }`. The JSON Schema uses only documented keywords
  (`type`, `properties`, `required`, `additionalProperties`, `enum`, `items`, `minItems`,
  `maxItems`, `description`). zod re-validates everything, including string lengths the
  provider schema cannot express.
- **Rationale**: the provider schema is the first fence, the application schema and business
  rules are the last (addendum §4.3). Schemas are small and flat to avoid "very large or deeply
  nested schemas may be rejected".
- **Open item (live capability check)**: whether each chain model accepts
  `responseJsonSchema` and a `thinkingConfig` in this exact flow. The adapter sends
  `thinkingConfig` only when `GEMINI_THINKING_LEVEL` is set (default unset), so an unsupported
  option cannot turn every call into a permanent 400.
- **Source**: https://ai.google.dev/gemini-api/docs/structured-output

## R3. Model chain

- **Decision (owner, 2026-09-30)**: `GEMINI_MODEL_CHAIN=gemini-3.5-flash-lite,gemini-3.1-flash-lite`.
  Only lite models: judging whether a term exists and naming a well-known example is short
  classification plus common world knowledge, not reasoning. **One model per request**: the
  primary answers every call; the fallback is called only after a transient failure of the
  primary (R5). Both are stable IDs from a different generation each, so an overload of one is
  unlikely to hit the other; no `preview`/`latest` (W04 §5).
- **Strictness**: the prompt tells the model to accept only terms it is certain exist and to
  reject with `nije_prepoznato` when unsure. Trade-off accepted by the owner: a rare but real
  term may occasionally be rejected; the player sees the reason and an example.
- **Rationale**: W04 — "the weakest/cheapest model that reliably solves the scenario". All
  3.x Flash-Lite models are free of charge on the free tier (pricing page). Model pages
  publish no benchmark for this task; 3.5 Flash-Lite is described as "low-latency,
  cost-effective … for high-throughput, low-cost execution", with structured output support.
- **Verification**: live eval L2 runs on the primary only (≈40 items, 5 calls, including a hard
  subset of long-tail real terms and plausible fakes). The fallback gets one capability-check
  call through the same flow (PDF §3.3: a fallback must be tested through the real scenario).
  If the primary misses SC-001/SC-008, we stop and report the numbers to the owner before
  changing the chain — no silent upgrade to a stronger model.
- **Note**: the free tier's data "is used to improve Google's products" (pricing page). We send
  only a letter, category names and ≤ 40-character answers — no personal data.
- **Sources**: https://ai.google.dev/gemini-api/docs/models, https://ai.google.dev/gemini-api/docs/pricing,
  https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite

## R3b. Rotation and daily quotas (plan A, 2026-09-30)

- Gemini rate limits are **per project and per model**; RPD resets at midnight Pacific time.
  A 429 names its window in `QuotaFailure.violations[].quotaId`
  (`…PerDayPerProjectPerModel…` vs `…PerMinute…`), so a spent daily quota is distinguishable.
- `src/server/ai/model-health.ts` keeps, per serverless instance: *cooling* models (timeout,
  5xx, network, per-minute 429; 1 min doubling to 15 min while failures repeat) and *exhausted*
  models (daily quota; until the reset). Each request starts from the first healthy model; if
  none, cooling ones are still tried, exhausted ones never. Best-effort: a fresh instance
  relearns at the cost of one failed attempt per model.
- Capability checks through the real flow (L1): `gemini-3.6-flash` passed (2.5 s, 8/8 verdicts
  on round S) with `thinkingLevel: "minimal"`; without it the model spent ≈75 thought tokens and
  3.1 s even on "ok". `gemini-3.5-flash` timed out (6 s; 16.8 s for "ok") and is held back.
- Rejected: sending the same request to several models in parallel (fastest, but doubles quota
  use and the W04 PDF forbids it).

## R4. Time budgets and retry policy

| Operation | Per-attempt timeout | Total deadline | Max attempts / model | Backoff | Min time to start an attempt |
| --- | --- | --- | --- | --- | --- |
| check-round | 6 s (was 8 s; plan A) | 18 s | 2 (initial + 1 retry) | 400 ms × 2ⁿ, full jitter, cap 2 s | 2 s |
| hint | 4 s (was 5 s; plan A) | 9 s | 2 | 300 ms × 2ⁿ, full jitter, cap 1.5 s | 1.5 s |

- Every attempt's timeout is `min(perAttempt, remainingDeadline)`; the attempt signal is
  `AbortSignal.any([attemptTimeout, deadline, request.signal])`, so a player who leaves also
  cancels the provider call (abort propagation, PDF §4).
- 429: the wait is the provider's retry hint (`Retry-After` header or the `RetryInfo.retryDelay`
  in the error body) when it fits in the remaining budget; otherwise skip straight to the next
  model or fail. Never wait past the deadline.
- The client adds its own 22 s (check) / 11 s (hint) fetch timeout above the server deadline,
  so a hung function still ends in the local fallback within SC-002.
- **Rationale**: "Retry and fallback share the same total deadline — four models with two
  retries each is not eight minutes" (PDF §4). 18 s leaves margin under the 20 s promise.
- Vercel: `api/*.ts` get `maxDuration: 30` in `vercel.json`, above the deadlines.

## R5. Error classification (from the W04 decision table)

| Provider signal | Class | Retry same model | Fallback to next | User outcome |
| --- | --- | --- | --- | --- |
| 400 | `invalid_request` | no | no | temporary-unavailable (logged as our bug) |
| 401, 403 | `auth_config` | no | no | not-configured |
| 404 | `model_unavailable` | no | yes (chain is pre-verified; logged loudly) | temporary-unavailable if exhausted |
| timeout / abort by our timer | `timeout` | **no** — changed 2026-09-30 after live evidence: retrying a slow model spent the deadline | yes, immediately | temporary-unavailable |
| network error | `transport` | yes | yes | temporary-unavailable |
| 429, per-minute quota | `rate_limited` | yes, honoring retry hint within budget | yes | temporary-unavailable |
| 429, per-day quota (`quotaId` …PerDay…) | `quota_exhausted` | no | yes, immediately; model skipped until the daily reset | `AI_QUOTA_EXHAUSTED` when every model is out |
| 500, 502, 503, 504 | `provider_transient` | yes | yes | temporary-unavailable |
| `promptFeedback.blockReason` or `finishReason: SAFETY/PROHIBITED_CONTENT` | `safety_refusal` | no | no | temporary-unavailable (generic message) |
| `finishReason: MAX_TOKENS` | `invalid_output:truncated` | no | no | temporary-unavailable |
| empty text | `invalid_output:empty` | no | no | temporary-unavailable |
| unparsable JSON | `invalid_output:json` | no | no | temporary-unavailable |
| zod schema failure | `invalid_output:schema` | no | no | temporary-unavailable |
| semantic failure (category set, rules) | `invalid_output:semantic` | no | no | temporary-unavailable |
| request aborted by the player | `cancelled` | no | no | none (connection gone) |
| missing key | `not_configured` | — (no call) | — | not-configured |

Malformed output is not blindly retried: at temperature 0 the same prompt will most likely
produce the same failure ("Ne kao slepi retry"). It is logged with a sanitized reason.

## R6. Where the safe fallback lives

- **Decision**: the server returns `{ ok: false, code, retryable, message }`; the browser owns
  the fallback outcome (score with 001's local rule, label "nije provereno", offer
  **Proveri ponovo**). The same path handles `fetch` rejections and client timeouts.
- **Rationale**: one fallback path for server failure *and* network failure; the local rule is
  already pure shared code. **Proveri ponovo** is one request per click — the browser never
  retries on its own (PDF §7: "beskonačno vrti retry u browseru" is forbidden).

## R7. Semantic validation (after zod)

Check-round (whole reply rejected on any structural rule; single examples dropped on
example rules):

1. The set of categories in the reply equals the set sent; no duplicates.
2. Categories sent for judging have `verdict ∈ {accepted, rejected}`; example-only categories
   have `verdict = not_judged`.
3. `accepted` requires a recognised name that passes GAME_SPEC §5.2 step 3. The name checked
   is the one (Serbian or English) the written answer is closest to by folded edit distance,
   Serbian on a tie — otherwise an English name spelled without diacritics ("Cacak") would let
   Čačak count for C (found while implementing, 2026-09-30). Failing → **overridden** to
   rejected, reason "ne počinje slovom X".
4. `accepted` also requires resemblance between the written answer and a recognised name
   (folded): prefix match, or edit distance ≤ max(2, ⌊len/4⌋) — this blocks the model from
   "correcting" a garbled answer into a different real term. Failing → rejected,
   "nije prepoznato".
5. `rejected` requires a reason from the enum; `accepted` has no reason.
6. Examples: the model returns one for every item; the application shows it only on
   rejected/empty lines (including lines it overrode — found while implementing, 2026-09-30);
   must pass step 3; ≤ 40 chars; not equal
   (folded) to the player's rejected answer; `noKnownTerm: true` ⇒ `example: null`.
   A failing example is dropped (not shown); the rest of the reply stands. An example that
   passes these checks is shown even if the model also set `noKnownTerm: true` (v1 dropped
   both; changed after the first live round, 2026-09-30). Telemetry counts each drop reason
   (`droppedWrongLetter`, `droppedTooLong`, `droppedSameAsAnswer`) and
   `contradictionsResolved` — counts only, no content.

Hint: the described term (Serbian and/or English) must pass step 3; the clue must be 10-200
characters and must not contain either name nor any 4-letter run of it after folding and
transliteration; `noKnownTerm: true` ⇒ no clue. Any failure → `invalid_output:semantic` → the
hint fails and costs nothing. The term never leaves the server.

## R8. Rate limiting and cost

- **Decision**: in-memory fixed-window limiter per client IP (check 12/min, hint 6/min) and
  per instance (60/min), answering `429 RATE_LIMITED` with no AI call.
- **Rationale**: FR-021; protects the free quota. Serverless instances do not share memory,
  so this is best-effort and documented as such (constitution VII). Hint credits are a game
  rule enforced by the browser; a determined user can bypass them by calling the endpoint
  directly, which costs only free quota (spec Assumptions).

## R9. Prompt injection and data minimization

- Answers are trimmed, control characters removed, ≤ 40 chars, and sent inside one JSON data
  object (`{"letter":"S","items":[{"category":"country","answer":"…"}]}`) under a system
  instruction that says the items are untrusted data to be classified, never instructions.
- Only the letter, category keys and answers leave the server — no IP, no ids, no history.
- Semantic rule R7-1/R7-2 means an injected instruction cannot add, drop or re-label items.

## R10. Week 4 artifacts ↔ Spec Kit files (no duplicates)

| W04 artifact | Where it lives |
| --- | --- |
| `AI_FEATURE_SPEC.md` | `specs/002-ai-answer-check-and-hints/spec.md` + `docs/GAME_SPEC.md` §5-§7 |
| `AI_FEATURE_PROMPT.md` | `contracts/prompts.md` (source of truth is `src/server/prompts/*.v1.ts`) |
| `AI_PROVIDER_CONTRACT.md` | `contracts/ai-provider-contract.md` |
| `AI_EVALS.md` | `docs/AI_EVALS.md` (new) — fake-matrix results + live eval |
| `EVIDENCE_W04.md` | `docs/EVIDENCE_W04.md` (new) |
| `AI_USAGE_LOG.md` | `docs/AI_USAGE_LOG.md` — new "Week 4 — provider calls" section (live calls only) |

`docs/README.md` (new, short) maps these names so a reviewer finds them.
