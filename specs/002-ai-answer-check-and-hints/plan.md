# Implementation Plan: AI Answer Check and Hint Credits

**Branch**: `002-ai-answer-check-and-hints` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-ai-answer-check-and-hints/spec.md`
**Depends on**: [001 plan](../001-singleplayer-vercel/plan.md) (single-player game, `api/` layout, domain letter rules)

## Approval

2026-09-30 — the owner approved the plan, including browser-enforced credits with a
server-side rate limit (research R8). Model decision (owner, 2026-09-30): the task is easy, so
only lite models are used. At runtime exactly **one** model is called per request; the second
model is called only when the first fails with a transient error. Primary
`gemini-3.5-flash-lite`, fallback `gemini-3.1-flash-lite`. The prompt instructs the model to be
strict: accept only terms it is certain exist (research R3).

**Amendment (owner, 2026-09-30) — model rotation, plan A.** After live timeouts: remember
model health per instance (cooling with escalating cool-down 1→15 min; out-of-daily-quota until
the Pacific-midnight reset); tell a per-day 429 from a per-minute one by its quotaId; move to
the next model at once after a timeout or a spent daily quota; per-attempt timeouts 6 s (check)
and 4 s (hint) within unchanged deadlines; a distinct `AI_QUOTA_EXHAUSTED` response and message
when every model is out of quota; Flash models get `thinkingLevel: "minimal"`. Chain:
`gemini-3.5-flash-lite → gemini-3.1-flash-lite → gemini-3.6-flash`; `gemini-3.5-flash` (the
fourth model of plan A) is held back because its capability check timed out.

## Summary

Two AI operations behind two stateless endpoints, built to the Week 4 reliability model:

- `POST /api/check-round` — once per round: judges the player's answers and returns an example
  for every missed or empty category (GAME_SPEC §5, §5.5).
- `POST /api/hint` — once per spent credit: a clue describing the best-known term without
  naming it (GAME_SPEC §7).

Both go through one provider-neutral **AI gateway** (bounded retry with jittered backoff,
sequential allowlisted model fallback, one shared deadline, error classification, abort
propagation, privacy-safe telemetry) to one **Gemini REST adapter** (plain `fetch`, key in a
header, no SDK and therefore no hidden retries). Every model reply passes empty-check → JSON
parse → zod schema → semantic validation with deterministic rules before anything reaches the
browser. On any failure the browser receives a stable safe outcome and scores the round
locally with 001's rule, labelled "nije provereno". Tests run on an injected fake `fetch`.

## Technical Context

**Language/Version**: TypeScript 5.9 strict; Node.js 24 on Vercel (≥22 locally)

**Primary Dependencies**: zod 3 (existing). No new runtime dependency: Gemini is called with
the built-in `fetch`, `AbortSignal.timeout` and `AbortSignal.any` (research R1).

**Storage**: none. Per-instance in-memory rate limiter only (best-effort, documented).

**Testing**: Vitest; fake transport = injected `fetch` scripted per attempt; handler tests
call the `api/*.ts` `fetch` export with a `Request`; fake clock + fake sleep for backoff.

**Target Platform**: Vercel Node functions (`api/`), dev middleware locally (001 R3)

**Project Type**: web application (SPA + stateless serverless functions)

**Performance Goals**: check result or safe failure ≤ 20 s end to end; hint ≤ 10 s (SC-002)

**Constraints**: ≤ 5 check calls + ≤ 3 hint calls per game (logical); free-tier quota;
≤ 20 live calls during development and ≤ 5 in the demo; key never leaves the server

**Scale/Scope**: 2 endpoints, 2 prompts, 1 provider, model chain of 2

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan complies |
| --- | --- | --- |
| I. Secrets server-only | ✅ | key read from `process.env` in `src/server/ai/config.ts`; sent as `x-goog-api-key` header (never in a URL); never in DTOs, logs, errors; build test greps `dist/` for a sentinel key |
| II. Model suggests, app decides | ✅ | 4-stage validation; letter rule, name-resemblance rule, category-set matching and points are code; AI "accepted" is overridden when a rule fails |
| III. Bounded reliability | ✅ | per-attempt timeout + shared deadline; ≤ 2 attempts per model; jittered exponential backoff; `Retry-After` honored within budget; fallback only for transient classes; sequential; no SDK |
| IV. Game works without AI | ✅ | client local fallback on every non-success and on network failure; hint credit decremented only on `ok: true` |
| V. Fake first | ✅ | injected `fetch`; test matrix in quickstart covers every W04 row incl. `providerCallCount === 0`; live smoke is a separate opt-in script with a call budget |
| VI. Contracts at boundaries | ✅ | zod schemas for both HTTP bodies, both model outputs, and AI config; JSON Schema for Gemini kept beside each zod schema with a parity test |
| VII. Stateless simplicity | ✅ | no DB, no SDK, no cache; rate limiter is in-memory and documented as best-effort |
| VIII. Telemetry | ✅ | one JSON log line per interaction with ordered attempts; test asserts it never contains the key, prompts, raw replies or answers |

## Architecture

```text
Browser (React)                     Vercel function (Node)                         Google
───────────────                     ──────────────────────                         ──────
round ends ──POST /api/check-round──▶ api/check-round.ts
                                      1 parse body (zod)          ── invalid → 400, 0 AI calls
                                      2 rate limit (per IP)       ── over → 429, 0 AI calls
                                      3 local preflight (domain)  ── split: judge vs example-only
                                      4 build AiRequest (prompt v1, output schema, budgets)
                                      5 gateway.generate()  ─────────────────────────────▶ generateContent
                                          attempts: initial → retry → fallback → retry     (model chain)
                                      6 parse → schema → semantic validation (domain)
                                      7 map to browser DTO (+ telemetry line)
◀── { ok: true, results } | { ok: false, code, retryable, message } ──
client: ok → verified line + examples
        else / network error → local score, "nije provereno", [Proveri ponovo]
```

`/api/hint` follows the same steps with its own schema, prompt and budgets.

### Layering (W04 addendum §2)

| Layer | File | Owns |
| --- | --- | --- |
| Feature service | `src/server/features/check-round.ts`, `hint.ts` | preflight, request building, semantic validation, DTO mapping |
| Gateway / policy | `src/server/ai/gateway.ts`, `retry-policy.ts`, `classify.ts` | attempts, backoff, deadline, fallback decisions, telemetry |
| Provider adapter | `src/server/ai/gemini-adapter.ts` | wire format, headers, abort, response normalization, usage mapping |
| Transport | injected `fetch` (real in prod, fake in tests) | HTTP only |

## Key design decisions (details in research.md)

| # | Decision |
| --- | --- |
| D1 | Plain REST `fetch` to `v1beta/models/{model}:generateContent`, `responseMimeType: application/json` + `responseJsonSchema`, `temperature: 0`, bounded `maxOutputTokens` (R1, R2) |
| D2 | Default chain `gemini-3.5-flash-lite,gemini-3.1-flash-lite` from `GEMINI_MODEL_CHAIN` — lite only; one model per request, the second only on transient failure; eval on the primary, capability check on the fallback (R3) |
| D3 | Budgets — check: 8 s per attempt, 18 s total; hint: 5 s per attempt, 9 s total; ≤ 2 attempts per model; backoff 400 ms × 2ⁿ with full jitter, cap 2 s (R4) |
| D4 | Error classes and retry/fallback table from the W04 PDF (R5, contract) |
| D5 | Fallback on failure lives in the **client** (local 001 rule), so server failure and network failure share one path; the server returns only a stable failure outcome (R6). A response arriving after the client gave up is ignored: the reducer accepts a result only for the current pending request id ("success after timeout", addendum §12) |
| D6 | Semantic validation rules: category set equality, letter rule on recognised names, written-vs-recognised resemblance, example rules, hint leak rule (R7) |
| D7 | Rate limit per client IP (`x-vercel-forwarded-for` / `x-forwarded-for`), check 12/min, hint 6/min, plus instance-wide 60/min; in-memory, best-effort (R8) |
| D8 | Prompt injection: answers are sent only inside a JSON data object, control characters stripped, ≤ 40 chars; system instruction states they are data (R9) |
| D9 | W04 artifacts mapped to Spec Kit files instead of duplicated (R10) |

## Project Structure

### Documentation (this feature)

```text
specs/002-ai-answer-check-and-hints/
├── plan.md                          # this file
├── research.md                      # Phase 0 decisions R1-R10
├── data-model.md                    # DTOs, model outputs, telemetry record
├── quickstart.md                    # test matrix, live smoke, evals, demo
├── contracts/
│   ├── http-api.md                  # browser ↔ our backend (both endpoints)
│   ├── ai-provider-contract.md      # W04 AI_PROVIDER_CONTRACT: model, timeout, retry, fallback, validation, failure
│   └── prompts.md                   # W04 AI_FEATURE_PROMPT: prompt v1 for both operations
└── tasks.md                         # /speckit-tasks
```

### Source Code (repository root)

```text
api/
├── check-round.ts                   # thin: Request → feature service → Response
└── hint.ts

src/contracts/
├── api.schemas.ts                   # CheckRoundRequest/Response, HintRequest/Response (zod)
└── ai-output.schemas.ts             # model output zod schemas + JSON Schemas for Gemini

src/domain/                          # (from 001) letter-match, validate-answer, score-round
├── resemblance.ts                   # written vs recognised name (bounded edit distance / prefix)
└── hint-leak.ts                     # clue contains term or any 4-letter run of it (folded, both scripts)

src/server/                          # relative imports only (001 R2)
├── ai/
│   ├── types.ts                     # AiRequest, AiResult, AiFailureCode, ProviderAttempt
│   ├── config.ts                    # env → validated AiConfig (key optional → not-configured)
│   ├── classify.ts                  # HTTP status / abort / body → AiFailureCode
│   ├── retry-policy.ts              # per-operation budgets; backoff + jitter; Retry-After
│   ├── gateway.ts                   # attempt loop, deadline, fallback, telemetry
│   ├── gemini-adapter.ts            # REST wire format ↔ AiRequest/normalized result
│   └── telemetry.ts                 # sanitized interaction record → console + test sink
├── features/
│   ├── check-round.ts               # preflight, request, semantic validation, DTO
│   └── hint.ts
├── handlers/                        # handler factories; api/*.ts only export default
│   ├── ai-endpoints.ts              # check-round and hint: body → limit → config → feature
│   └── health.ts
├── http/
│   ├── json-handler.ts              # method/body/size checks, safe error responses
│   └── rate-limit.ts
└── prompts/
    ├── check-round.v2.ts            # system instruction + input builder (v1 → v2 on 2026-09-30)
    └── hint.v1.ts

src/client/
├── api/ai-client.ts                 # fetch wrappers with client-side timeout; never throws
├── state/game-reducer.ts            # + checking phase, verified/unverified, credits, hints
└── screens/…                        # AnswerScreen hint control; ResultsScreen examples/labels

tests/
├── unit/   classify, retry-policy, gateway, gemini-adapter, check-round-validation,
│           hint-validation, resemblance, hint-leak, api-schemas, ai-config, telemetry-redaction
├── api/    check-round.test.ts, hint.test.ts   # handler-level, fake fetch
├── fakes/  fake-fetch.ts, fixtures/            # scripted provider replies (no real data)
└── security/ bundle-secret.test.ts              # built client contains no key sentinel

scripts/
└── live-smoke.ts                    # opt-in (`npm run smoke:live`), budgeted, prints sanitized results
```

**Structure Decision**: extend 001's layout; everything provider-specific stays in
`gemini-adapter.ts`, everything policy-specific in `src/server/ai/`, everything game-specific
in `src/server/features/` and `src/domain/`.

## Implementation order (for /speckit-tasks)

1. Contracts (TDD): HTTP schemas, model output schemas + JSON Schema parity tests.
2. Domain: resemblance, hint-leak, letter rule on recognised names (tables from GAME_SPEC).
3. `classify` + `retry-policy` (pure, table tests from the W04 decision table).
4. Gateway with fake adapter: retry, fallback, deadline, abort, telemetry (quickstart T-rows).
5. Gemini adapter with fake `fetch`: request shape, header auth, response/usage/blocked/
   truncated/empty normalization.
6. Feature services + `api/` handlers: preflight, `providerCallCount === 0`, semantic
   validation, DTO mapping, rate limit.
7. Client: checking phase, local fallback, **Proveri ponovo**, examples on results, hint
   control + credits, abort pending hint on round end.
8. Security tests (bundle sentinel, log redaction, error bodies).
9. Live: capability check (1 call per chain model) → curated eval (≤ 8 calls) → record in
   `docs/AI_EVALS.md` and `docs/EVIDENCE_W04.md`; adjust chain order only if evals require.
10. `npm run verify`; docs (README AI section, usage log, evidence).

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Two AI operations (W04 asks for one) | owner explicitly requested both check+examples and hints | dropping hints contradicts the owner; hints are P2 so check ships first if time runs short |
| Hand-written JSON Schema next to each zod schema | Gemini needs JSON Schema; zod 3 cannot emit it | upgrading to zod 4 changes every schema in the repo; a parity test keeps the two in sync |
