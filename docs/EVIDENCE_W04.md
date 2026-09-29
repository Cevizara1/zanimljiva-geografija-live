# EVIDENCE_W04 — Reliable AI integration

## Architecture and boundary

```text
Browser (React SPA, Vercel static)
  │  POST /api/check-round  { letter, answers }         POST /api/hint { letter, category }
  ▼
Vercel Node function (api/*.ts → src/server/handlers)
  1. body: POST, ≤ 4 KB, JSON, strict zod schema        → 400, 0 AI calls
  2. rate limit per client / per instance                → 429, 0 AI calls
  3. config: GEMINI_API_KEY present, chain allowlisted   → 503 AI_NOT_CONFIGURED, 0 calls
  4. local rule (domain): length + starting letter       → locally rejected text never sent
  5. gateway: attempts through the model chain           → timeout / retry / fallback / deadline
  6. Gemini adapter: REST generateContent, key in header → normalized result or error class
  7. validation: empty → JSON → zod → semantic rules     → overrides, dropped examples
  8. safe DTO + one telemetry line                       → browser
  ▼
Browser: verified result, or local score marked "nije provereno" + "Proveri ponovo"
```

- **Where the key is**: `GEMINI_API_KEY` in `.env` locally (git-ignored) or Vercel's
  environment settings. Read only by `src/server/ai/config.ts`; sent only as the
  `x-goog-api-key` header. `tests/security/bundle-secret.test.ts` builds the client with a
  sentinel key and proves no emitted file contains it.
- **Provider / model**: Google Gemini free tier; chain `gemini-3.5-flash-lite` →
  `gemini-3.1-flash-lite` → `gemini-3.6-flash` with per-instance rotation (research R3, R3b).
  Browser never picks.

## Contracts

- Request/response: [http-api.md](../specs/002-ai-answer-check-and-hints/contracts/http-api.md),
  implemented in `src/contracts/api.schemas.ts`.
- Model output: [ai-provider-contract.md](../specs/002-ai-answer-check-and-hints/contracts/ai-provider-contract.md),
  implemented in `src/contracts/ai-output.schemas.ts` (JSON Schema for Gemini + zod, parity-tested).

## Success flow

Round with letter Č, "Cacak" in Grad and More left empty → one request with eight items (Grad
to judge, the rest example-only) → model: accepted, recognised "Čačak" → step 3 checks the
closest name, Čačak, against Č → accepted, 10 points, shown as "Čačak"; More shows an example
or "nema poznatog pojma na ovo slovo" (tests T21, `check-round-validation.test.ts`).

## Failure flows

| Failure | What happens | Test |
| --- | --- | --- |
| 503 from the primary twice | retry with jitter, then fallback model | T05 |
| every attempt fails | ≤ 4 calls within 18 s → `AI_UNAVAILABLE` (retryable) → local score | T06 |
| attempt hangs | aborted at min(8 s, remaining); next attempt uses what is left | T07 |
| 429 with a long retry hint | not waited for; fallback immediately | T08 |
| 401/403/400/refusal/truncated | 1 call, no retry, no fallback | T09-T13 |
| not JSON / wrong schema / wrong items | rejected, never shown | T15-T17 |
| model accepts "Cacak" for C | overridden: "ne počinje slovom C" | T18 |
| model turns "Kxqwe" into "Kenija" | overridden: "nije prepoznato" | T19 |
| hint contains the word | discarded, credit not spent | H02 |
| browser offline / server hung | client timeout 22 s → local score | C02 |
| late answer after client gave up | ignored (request id) | C05 |

## Test results

Recorded in [AI_EVALS.md](AI_EVALS.md). `npm run verify` on 2026-09-30 after the v2 fix:
22 test files, 365 tests passed, build succeeded. **Live**: 4 calls from the owner's browser
game recorded; the pre-registered L1-L3 runs are still pending.

## Findings made while implementing (recorded in the specs)

1. English names of Serbian places are often written without diacritics ("Cacak"), so "Serbian
   *or* English name starts with the letter" would let Čačak count for C. Step 3 now checks the
   name closest to what the player wrote (research R7-3, GAME_SPEC §5 step 3).
2. When the application overrides an accepted answer, the model had not given an example.
   The prompt now asks for an example on every item; the app shows it only on missed lines.
3. The model could return an official name ("Sjedinjene Američke Države") for a common one
   ("Amerika"), which the resemblance rule would reject. The prompt now asks for the same name
   the player used, corrected only in spelling.
4. The local letter check alone would have scored "Šabac" for S. A written č/ć/š/ž is now
   unambiguous; leniency applies only when the diacritic is missing (GAME_SPEC §5.2).
5. Gemini's `responseJsonSchema` subset has no nullable types, so "no value" is `""`.
6. **Live** (owner's first game): the model set `noKnownTerm: true` next to good examples for
   rejected answers, reading it as "the answer is unknown"; v1 dropped both. Fixed in
   `check-round.v2` (clearer prompt and schema description) plus validation that prefers a
   verified example; telemetry now names the drop reason.
7. **Live**: `gemini-3.5-flash-lite` slowed to 13.6 s for a one-word reply while
   `gemini-3.1-flash-lite` answered in 1.9 s. Our policy retried the slow model after a
   timeout and exhausted the deadline before the fallback could run (three failed requests in
   the owner's game). A timeout now falls back immediately; the retry of the same model stays
   for 429, 5xx and network errors.
8. **Model rotation (plan A)**: per-instance model health with escalating cool-down, daily-quota
   detection by `quotaId`, a distinct `AI_QUOTA_EXHAUSTED` message, shorter attempts (6 s / 4 s)
   so three models fit a check, and `thinkingLevel: "minimal"` for Flash models (0.96 s vs 3.1 s
   on a trivial call). `gemini-3.6-flash` passed its capability check (8/8); `gemini-3.5-flash`
   timed out and is held back.

## Debug visibility

Free-tier projects get no request logs in AI Studio (logs need the paid tier), so a local,
opt-in `AI_DEBUG_LOG=1` prints sent content and raw replies to the developer's terminal only —
constitution 1.1.0 exception, forced off on Vercel/production, tested in
`tests/unit/debug-log.test.ts`.

## Known limitations

- Rate limits and hint credits are per serverless instance / per browser — best-effort.
- AI verdicts are non-deterministic; temperature 0 and a strict prompt reduce but do not remove it.
- Strictness may reject rare real terms; the player sees the reason and an example.
- Live quality (SC-001, SC-008) is unmeasured until L2 runs.

## Contributions

- Owner (Cevizara): product decisions — single-player, no accounts, 26 letters, 3 credits with
  full points, descriptive hints, examples for misses, lite models only; approvals recorded in
  the plans.
- Coding agent (Claude): Spec Kit artifacts, implementation, tests, this evidence — every
  claim above is backed by a command run in the session that produced it.
