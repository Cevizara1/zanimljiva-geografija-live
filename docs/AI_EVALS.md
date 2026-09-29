# AI_EVALS — AI answer check and hints (Week 4)

Expectations were written before execution, in
[quickstart.md](../specs/002-ai-answer-check-and-hints/quickstart.md). Fake-provider evals run on
every `npm test`; live evals are opt-in and budgeted.

## Required W04 cases

| ID | Scenario | Expected | Where | Result (2026-09-30, fake provider) |
| --- | --- | --- | --- | --- |
| A1 | Valid round, model answers | Structured verdicts + examples, 1 call | `tests/api/check-round.test.ts` T01 | PASS |
| A2 | Invalid local input (unknown category, 41 chars, letter Q, extra key, bad JSON, 5 KB) | 400 and `providerCallCount === 0` | T02 | PASS |
| A3 | Provider failure / timeout | Safe `AI_UNAVAILABLE`, bounded attempts, game scores locally | T06, T07, `ai-client.test.ts` | PASS |
| A4 | Malformed output (not JSON, wrong schema, wrong items) | Rejected, never shown as a result | T15-T17 | PASS |

## Full fake matrix

All rows of the quickstart matrix T01-T24, H01-H04, C01-C05, S01-S03 are automated; every row
of GAME_SPEC §5.2, §5.3 and §5.4 is a test case (`letter-match.test.ts`,
`check-round.test.ts` T21). Last run in this session:

```text
> npm run verify
  Test Files  22 passed (22)
       Tests  365 passed (365)   # after check-round.v2
  ✓ built in 1.35s
```

Coverage (`vitest run --coverage`): 97.96% lines, 93.52% branches over src/domain,
src/contracts, src/server and api/ (the three `api/*.ts` files are 4-line wrappers).

## First live use — owner's browser game (2026-09-30, `check-round.v1`, `hint.v1`)

Not the planned L2 eval (no expected answers were fixed in advance), but real calls, so recorded.

| Call | Model | Attempts | Latency | Tokens | Outcome |
| --- | --- | --- | --- | --- | --- |
| hint | gemini-3.5-flash-lite | 1 | 927 ms | 628 | success |
| hint | gemini-3.5-flash-lite | 1 | 1068 ms | — | `invalid_output:semantic`, leak rule fired; credit not spent |
| check-round (L) | gemini-3.5-flash-lite | 1 | 1628 ms | 1287 | success, 0 examples dropped |
| check-round (N) | gemini-3.5-flash-lite | 1 | 2051 ms | 1550 | success, **2 examples dropped** |

Observations from the owner's screenshot: every verdict on both rounds matched the GAME_SPEC
rules (e.g. "nikaragva" as Planina → "nije planina"; "Lavsko" more → "ne postoji", example
"Labradorsko more"). Planina and More in round N showed no example → fixed in `check-round.v2`
(see prompts.md changelog). The leaked hint could not be inspected: prompts and replies are not
logged (constitution VIII). Whether the 4-letter leak rule is too strict stays open until a
debug capture or more data.

## Live evals (opt-in, `npm run smoke:live`)

**Status: NOT RUN YET.** The key is now configured and 4 live calls were made by the owner's
browser game (above), but the pre-registered L1-L3 runs have not. Do not read the fake results
or the four calls above as proof that the live model meets SC-001/SC-008.

| ID | Command | Calls (budget) | Pass condition | Result |
| --- | --- | --- | --- | --- |
| L1 | `smoke:live -- capability <model>` | ≤ 2 each | schema-valid reply through the real flow | `gemini-3.6-flash` **PASS** (2.5 s, 8/8); `gemini-3.5-flash` **FAIL** (timeout, held back); `gemini-3.1-flash-lite` pending (only a trivial call so far) |
| L2 | `smoke:live -- eval` (primary `gemini-3.5-flash-lite`, 5 rounds × 8 = 40 items) | ≤ 7 | ≥ 90% verdict agreement; 100% wrong-letter rejected; 0 fakes accepted; shown examples real and on the letter; p95 < 8 s | pending |
| L3 | `smoke:live -- hints` (A/Država, D/Reka, P/Grad) | ≤ 4 | clue passes the leak rule, describes a correct term | pending |
| L4 | one full game in the browser with one hint | ≤ 6 | verified lines, examples, a hint | pending |

The L2 set is five real rounds (see `scripts/live-smoke.ts`): Latin/Cyrillic, missing
diacritics, typo, plural, ijekavian, breed, long-tail terms (Knjaževac, Čvrsnica), a
wrong-letter trap (Cehotina for Č), a written diacritic (Šljiva for S), a wrong category
(Mont Blanc as a river), an abstract noun (Nada), garbage (Kxqwe), a plausible fake
(Mirovgrad), a prompt injection, and two empty categories.

If L2 misses a threshold: stop, record the numbers here, and ask the owner before changing the
model chain or the prompt (research R3). A prompt change means `check-round.v2` and a re-run.
