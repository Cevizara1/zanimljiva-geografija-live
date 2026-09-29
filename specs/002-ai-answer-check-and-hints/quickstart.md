# Quickstart: validate feature 002

## Setup

```bash
cp .env.example .env
# .env — only this line is required:
GEMINI_API_KEY=<your free key from https://aistudio.google.com/apikey>
# optional overrides (defaults shown):
# GEMINI_MODEL_CHAIN=gemini-3.5-flash-lite,gemini-3.1-flash-lite
# GEMINI_THINKING_LEVEL=            (unset = not sent)
npm install
npm run dev
```

Create the key in a Google project **without billing enabled**, so an exhausted quota can
never cost money. On Vercel set the same variable in Project → Settings → Environment
Variables. Without a key the game still works, with every round marked "nije provereno".

## Automated test matrix (fake `fetch`, zero network) — `npm test`

| ID | Scenario | Expected |
| --- | --- | --- |
| T01 | Valid round, first model succeeds | 1 provider call, `fallbackUsed=false`, verified lines, points = 10 × accepted |
| T02 | Malformed request (unknown category / 41-char answer / letter "Q" / extra key / 5 KB body) | 400, **`providerCallCount === 0`** |
| T03 | Every answer empty or locally rejected | exactly 1 call; payload contains no answer text; every line has example or `noKnownTerm` |
| T04 | First model 503, retry succeeds | 2 calls, kinds `initial,retry`, success |
| T05 | First model 503 twice, fallback succeeds | 3 calls, kinds `initial,retry,fallback`, `fallbackUsed=true` |
| T06 | All models transient-fail | ≤ 4 calls, `AI_UNAVAILABLE` retryable, elapsed ≤ deadline (fake clock) |
| T07 | Attempt hangs | aborted at 8 s; next attempt uses remaining budget; total ≤ 18 s |
| T08 | 429 with retry hint larger than remaining budget | no wait; goes to fallback or fails; never exceeds deadline |
| T09 | 401 / 403 | 1 call, no retry, no fallback, `AI_UNAVAILABLE` (logged `auth_config`) |
| T10 | 400 from provider | 1 call, no retry, no fallback |
| T11 | 404 on first model | no retry, fallback to second model |
| T12 | `blockReason` / `finishReason: SAFETY` | 1 call, no fallback, safe failure |
| T13 | `finishReason: MAX_TOKENS` | safe failure `invalid_output:truncated`, no retry |
| T14 | Empty text | safe failure `invalid_output:empty` |
| T15 | Not JSON | safe failure `invalid_output:json` |
| T16 | JSON failing zod (extra field, wrong enum, 200-char name) | safe failure `invalid_output:schema` |
| T17 | Category missing / duplicated / not sent | safe failure `invalid_output:semantic` |
| T18 | AI accepts "Cacak" for C (recognised Čačak) | overridden → rejected "ne počinje slovom C" |
| T19 | AI accepts "Kxqwe" as "Kenija" | overridden → rejected "nije prepoznato" (resemblance) |
| T20 | Example starts with wrong letter / equals rejected answer | that example dropped, rest of the reply shown |
| T21 | Every GAME_SPEC §5.3 and §5.4 row | fake reply per row; final verdict and reason as in the table |
| T22 | No key configured | 503 `AI_NOT_CONFIGURED`, 0 calls; `/api/health` → `ai: not_configured` |
| T23 | Rate limit exceeded | 429 `RATE_LIMITED`, 0 calls |
| T24 | Player aborts request | provider call aborted, `cancelled`, no retry |
| H01 | Hint success | 1 call; `kind: clue`; term absent from response body |
| H02 | Clue contains term / a 4-letter run / the English name / Cyrillic form | `invalid_output:semantic`, safe failure |
| H03 | `noKnownTerm` | `kind: no_known_term` |
| H04 | Hint term with wrong letter | safe failure |
| C01 | Reducer: credits −1 only on `clue`; unchanged on failure / no-term / abort | |
| C02 | Reducer: `fetch` rejects / client timeout → local score, unverified, **Proveri ponovo** | |
| C03 | Reducer: recheck success replaces the line and recomputes the total | |
| C04 | Reducer: `NEXT` disabled while checking | |
| C05 | Reducer: a check/hint response arriving after the client timeout (stale request id) is ignored | |
| S01 | Telemetry for T05 lists 3 ordered attempts with model, kind, status, latency | |
| S02 | No telemetry line, response body or error contains the key, prompt, reply text or answers | |
| S03 | `npm run build` with `GEMINI_API_KEY=SENTINEL_…`; no file in `dist/client` contains the sentinel | |

## Live checks (opt-in, budgeted) — `npm run smoke:live`

The script refuses to run without `GEMINI_API_KEY`, prints only sanitized results, and stops at
its call budget. Every run is recorded in `docs/AI_USAGE_LOG.md`.

| ID | What | Calls | Pass condition |
| --- | --- | --- | --- |
| L1 | Capability check of the fallback `gemini-3.1-flash-lite`: one check-round through the real flow | 1 | schema-valid JSON, passes validation (PDF §3.3) |
| L2 | Curated eval on the primary `gemini-3.5-flash-lite` (first call doubles as its capability check): GAME_SPEC §5.3/§5.4 rows, a hard subset (small towns such as Knjaževac, short rivers such as Ćehotina, plausible fakes such as "Kragujevo"), empty categories for examples — ~40 items in 8-item rounds | 5 | SC-001 ≥ 90% agreement, 100% wrong-letter rejected, 0 plausible fakes accepted; SC-008 examples ≥ 95% real, 100% right letter; p95 latency < 8 s |
| L3 | Hints: A/Država, D/Reka, P/Grad | 3 | clue passes leak rule; described term correct |
| L4 | Browser: one full game on `npm run dev` with one hint | 6 | verified lines, examples shown, hint shown |

Development total 15 calls (budget 20). At runtime every request calls one model; the fallback
is used only after a transient failure. If L2 misses a threshold, stop and report the numbers
to the owner before changing the chain. Demo: 3 rounds + 1 hint live (4 calls, budget 5),
then the safe fallback shown with the key removed.

## Demo script (6 minutes, W04 §36)

1. Scenario: practice game; AI checks answers and teaches examples; hints cost credits.
2. Architecture: browser → `/api/*` → gateway → Gemini; key only in server env.
3. Success: play a round with "Cacak" for Č and an empty category → verified + example.
4. Contract: show `http-api.md` and the zod schemas; T02 proves 0 calls on invalid input.
5. Failure: set `GEMINI_MODEL_CHAIN=nonexistent-model` → round scored "nije provereno".
6. Tests and evidence: `npm test` output, telemetry line, `docs/EVIDENCE_W04.md`.
