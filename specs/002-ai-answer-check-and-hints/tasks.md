---
description: "Task list for 002 — AI answer check and hint credits"
---

# Tasks: AI Answer Check and Hint Credits

**Input**: `specs/002-ai-answer-check-and-hints/` — plan.md, spec.md, research.md,
data-model.md, contracts/, quickstart.md
**Depends on**: 001 complete (domain letter rules, reducer, `api/` layout, dev middleware)
**Tests**: required (constitution V). Test IDs T01…S03 refer to quickstart.md.

## Phase 1: Setup

- [x] T101 Add `smoke:live` script (`tsx scripts/live-smoke.ts`) to package.json; keep `tsx` as dev dependency
- [x] T102 [P] `.env.example`: `GEMINI_API_KEY=`, commented `GEMINI_MODEL_CHAIN=gemini-3.5-flash-lite,gemini-3.1-flash-lite`, `GEMINI_THINKING_LEVEL=`

## Phase 2: Foundational — contracts, config, gateway (blocking)

- [x] T103 [P] Test first: tests/unit/api-schemas.test.ts — CheckRoundRequest (letter ∈ 26, exactly 8 category keys, each ≤ 40 chars, strict), HintRequest, both response unions (contracts/http-api.md)
- [x] T104 [P] Test first: tests/unit/ai-output-schemas.test.ts — zod accepts the contract examples; rejects extra field, wrong enum, name > 60 chars, clue < 10 or > 200 chars, control chars; JSON Schema ↔ zod parity on fixtures
- [x] T105 Implement src/contracts/api.schemas.ts and src/contracts/ai-output.schemas.ts (zod + hand-written JSON Schema constants)
- [x] T106 [P] Test first: tests/unit/ai-config.test.ts — no key → `configured: false` (no throw); chain parsing/trim/dedupe; only IDs matching `^gemini-[0-9a-z.-]+$` without `preview|latest`; error text never echoes values
- [x] T107 Implement src/server/ai/config.ts and src/server/ai/types.ts (data-model.md server types)
- [x] T108 [P] Test first: tests/unit/classify.test.ts — every row of research R5
- [x] T109 [P] Test first: tests/unit/retry-policy.test.ts — budgets (check 8 s/18 s, hint 5 s/9 s), ≤ 2 attempts per model, backoff `base × 2ⁿ` full jitter with cap, retry-hint parsing (`Retry-After` header, `RetryInfo.retryDelay`), "min time to start"
- [x] T110 Implement src/server/ai/classify.ts and src/server/ai/retry-policy.ts (pure; injected random)
- [x] T111 Test first: tests/unit/gateway.test.ts with a fake adapter + fake clock/sleep — T01, T04-T11, T24; attempt kinds `initial/retry/fallback`; sequential only; deadline never exceeded; abort propagates
- [x] T112 Implement src/server/ai/gateway.ts (`generate(request, deps: { adapter, clock, sleep, random, telemetry, signal })`)
- [x] T113 [P] Test first: tests/unit/telemetry.test.ts — S01 ordered attempts; S02 record never contains key, prompt, reply text, answers
- [x] T114 Implement src/server/ai/telemetry.ts (`ai.interaction` JSON line via console.info + injectable sink)
- [x] T115 Test first: tests/unit/gemini-adapter.test.ts with fake `fetch` — URL `v1beta/models/{model}:generateContent`, header `x-goog-api-key`, no key in URL, body fields (systemInstruction, contents, generationConfig incl. responseJsonSchema, temperature, maxOutputTokens; thinkingConfig only when configured); normalization of text, usageMetadata, blockReason, finishReason SAFETY/MAX_TOKENS, empty, non-JSON body errors; T12-T15
- [x] T116 Implement src/server/ai/gemini-adapter.ts
- [x] T117 [P] Implement src/server/http/json-handler.ts (POST only, ≤ 4 KB, JSON parse, zod, safe error bodies, `Cache-Control: no-store`) and src/server/http/rate-limit.ts (per IP check 12/min, hint 6/min, instance 60/min, injected clock)

**Checkpoint**: gateway + adapter green on fakes; zero network in tests.

## Phase 3: User Story 1 — check + examples (P1) 🎯 MVP

- [x] T118 [P] [US1] Test first: tests/unit/resemblance.test.ts (prefix or edit distance ≤ max(2, ⌊len/4⌋), folded) and src/domain/resemblance.ts
- [x] T119 [US1] Test first: tests/unit/check-round-validation.test.ts — research R7 rules 1-6; T16-T20; override reasons "ne počinje slovom X", "nije prepoznato"; example dropping; reason mapping (ne_postoji → "ne postoji", pogresna_kategorija → "nije <kategorija>", istorijski → "ne postoji danas", nije_prepoznato → "nije prepoznato")
- [x] T120 [US1] Implement src/server/prompts/check-round.v1.ts (system instruction = contracts/prompts.md; input builder: `answer: null` for empty/locally rejected; control chars stripped)
- [x] T121 [US1] Implement src/server/features/check-round.ts (preflight via domain, request build, gateway, semantic validation, DTO lines in category order, points)
- [x] T122 [US1] Test first: tests/api/check-round.test.ts — T01, T02 (`providerCallCount === 0` for each malformed case), T03 (payload contains no answer text), T06, T09, T21 (every GAME_SPEC §5.3/§5.4 row via scripted fake replies), T22, T23; HTTP codes per contracts/http-api.md
- [x] T123 [US1] Implement api/check-round.ts (thin: json-handler → rate limit → feature → Response); extend api/health.ts `ai` field from config
- [x] T124 [US1] Implement src/client/api/ai-client.ts (`checkRound`, `hint`; client timeouts 22 s / 11 s via AbortSignal; never throws; request id)
- [x] T125 [US1] Reducer: `checking` phase, `CHECK_OK` / `CHECK_FAILED` with request id (C02, C04, C05) in src/client/state/game-reducer.ts; tests in tests/unit/game-reducer.test.ts
- [x] T126 [US1] ResultsScreen: recognised name when accepted, reason when rejected, `primer: X` / "nema poznatog pojma na ovo slovo" for misses, "Proveravamo odgovore…" while checking

## Phase 4: User Story 2 — game keeps going (P1)

- [x] T127 [US2] Reducer `RECHECK` flow (C03): replaces the round's result and recomputes the total; one request per click
- [x] T128 [US2] ResultsScreen: "nije provereno" label per line, message by `unverifiedReason`, **Proveri ponovo** (when retryable or network), **Sledeća runda** always available after a result; final total marks unverified rounds

## Phase 5: User Story 3 — hints (P2)

- [x] T129 [P] [US3] Test first: tests/unit/hint-leak.test.ts (term, English name, Cyrillic form, any 4-letter run, folded) and src/domain/hint-leak.ts
- [x] T130 [US3] Implement src/server/prompts/hint.v1.ts and src/server/features/hint.ts (term letter rule, clue length, leak rule; term never in DTO)
- [x] T131 [US3] Test first: tests/api/hint.test.ts — H01-H04, T02-style 0-call cases, rate limit; then api/hint.ts
- [x] T132 [US3] Reducer: `hintCredits = 3`, HINT_REQUESTED / HINT_OK / HINT_NO_TERM / HINT_FAILED, abort on round end (C01) with tests
- [x] T133 [US3] AnswerScreen: per-category hint control (disabled at 0 credits, when a hint exists, while one is pending, or when `/api/health` says not configured), clue shown under the field, credits shown in the round header

## Phase 6: Security & evidence

- [x] T134 [P] tests/security/bundle-secret.test.ts (S03): build with a sentinel key and grep `dist/client`
- [x] T135 [P] Error-body test: no response in tests/api/* contains `stack`, provider text, model id or key
- [x] T136 Implement scripts/live-smoke.ts (opt-in; refuses without key; L1-L3 per quickstart with hard call budget; prints sanitized per-item results and telemetry; never prints the key)
- [ ] T137 Run L1-L3 with the owner's key (budget 15 incl. L4); record results in docs/AI_EVALS.md and docs/AI_USAGE_LOG.md ("Week 4 — provider calls"); if L2 misses a threshold, stop and report
- [x] T138 docs/EVIDENCE_W04.md (architecture diagram, boundary, key location, provider/model, contracts, success/failure flow, test output, limitations, contributions) and docs/README.md mapping W04 artifact names (research R10)
- [x] T139 README: AI section (what it does, the one variable, what happens without it)
- [ ] T140 `npm run verify` and record the real output; L4 manual browser game

## Dependencies

Phase 2 blocks all. US1 → US2 (uses the same results screen); US3 independent of US2.
Live tasks T137/T140-L4 wait for the owner's key in `.env`.

## Implementation strategy

MVP = Phases 1-4 (verified check with safe fallback). Hints (Phase 5) next. Live eval last.

## Status (2026-09-30)

All tasks implemented except the live ones. Automated matrix green (see docs/AI_EVALS.md).

- T137 live L1-L3 and T140's L4 browser game: **not run** — waiting for the owner's key.
- Deviations from plan: provider-side JSON Schema uses `""` instead of nullable types (Gemini
  subset); the model returns an example for every item (the app shows it only on misses); the
  letter rule is checked on the recognised name closest to what was written; the prompt asks
  for the same name the player used. All recorded in research R7 and EVIDENCE_W04.
- Tests landed as: `classify-and-retry.test.ts` (T108-T109), `output-rules.test.ts`
  (T104, T118, T129), `rate-limit-and-http.test.ts`, `ai-client.test.ts` (C02),
  `game-reducer.test.ts` (C01-C05).
