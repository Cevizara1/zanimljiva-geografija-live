# EVIDENCE 004 — Tool call for hints

Feature: [spec 003](../specs/003-hint-tool-call/spec.md) · Contract: [TOOL_CONTRACT.md](TOOL_CONTRACT.md)
· Date: 2026-09-30 · Provider: Gemini (model chain as in [EVIDENCE_W04.md](EVIDENCE_W04.md))

## What was built

The hint model answers by proposing one call to `show_hint`. The server checks the number of
calls, the tool name against the allowlist, the arguments against a strict schema, and the scope
(the request's own letter and category). Only then does it run the read-only tool, which applies
GAME_SPEC §7. Refusals return a safe message and keep the credit. One provider call per hint.

## Deliberate deviation

Session 004 describes the model reading data through a tool (two model calls). We use one call:
the model already gets the letter and category in the request, and the tool's result goes to the
player. Owner decision to avoid doubling free-tier usage. Every boundary the session grades —
allowlist, strict arguments, pre-execution refusal, read-only, final output validation, safe
fallback — is present and tested.

## Offline evidence (fake provider, no network)

`npm run verify` on 2026-09-30: typecheck, lint, 26 test files / 419 tests, build — all passed.

| Scenario | Result |
| --- | --- |
| `{"detail":"everything","executeCode":"..."}` in the arguments | refused, `tool:invalid_args`, tool callCount = 0 |
| unknown tool `get_game_state` | refused, `tool:unknown`, callCount = 0 |
| no tool call (plain JSON text) | refused, `tool:missing_call`, 1 provider call, no fallback |
| two calls | refused, `tool:too_many_calls` |
| another letter / category | refused, `tool:out_of_scope` |
| clue names the term / wrong letter / too short | `invalid_output:semantic`, credit kept |
| 503 twice, then success on the next model | bounded retry + fallback, clue returned |
| telemetry | outcome class only; no tool arguments |

## Live evidence

**None yet.** By owner decision no live call was made before the deploy; the owner plays on the
deployed site. Record here: date, commit, model, whether the hint appeared, and the
`ai.interaction` line from the Vercel logs (outcome, attempts, latency).

## Open

- Live confirmation that the lite models accept a forced function call.
- A same-eval before/after comparison of `hint.v1` and `hint.v2`.
