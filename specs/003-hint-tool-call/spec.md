# Feature 003 — Hint through a gated tool call

**Status**: implemented 2026-09-30 · **Owner decision**: one provider call per hint · **Builds on**: 002

## Why

W04 Session 004 asks for a tool the model proposes and the application validates before it runs
(allowlist, strict arguments, scope, read-only, safe fallback). The owner keeps one provider call
per hint, so the classic two-call loop (tool result back to the model) is not used.

## User story

A stuck player spends a hint credit and gets a clue, exactly as in 002. Nothing changes in the UI
or in `/api/hint`'s request and response.

## Acceptance scenarios

1. **Given** a valid hint request, **when** the model calls `show_hint` with arguments that pass
   the gate, **then** the player gets the clue after one provider call.
2. **Given** the model proposes `{"detail":"everything","executeCode":"..."}` or any argument the
   contract does not list, **then** the call is refused before the tool runs (callCount = 0) and
   the player sees the safe message; the credit is not spent.
3. **Given** the model calls an unknown tool, calls no tool, calls more than once, or uses another
   letter or category than the request, **then** the same refusal applies, with no retry and no
   fallback model.
4. **Given** the tool's output breaks GAME_SPEC §7 (names the term, wrong letter, too short),
   **then** it is discarded as invalid output.
5. **Given** a timeout, 429 or 5xx, **then** 002's bounded retry and model fallback apply.

## Requirements

- FR-301: The hint request declares exactly one tool, `show_hint`, and forces it
  (`mode: "ANY"`, `allowedFunctionNames: ["show_hint"]`); no JSON response format is sent.
- FR-302: The gate order is: count → allowlist → strict arguments → scope → read-only → execute.
- FR-303: Gate refusals are terminal failure classes (`tool:*`), never retried or failed over.
- FR-304: The tool is read-only and pure; it changes no state and never returns the term.
- FR-305: Telemetry records the failure class only, never the tool arguments.
- FR-306: The public `/api/hint` contract and the client are unchanged.

## Contract and evidence

- [docs/TOOL_CONTRACT.md](../../docs/TOOL_CONTRACT.md): definition, gate, test matrix.
- [docs/EVIDENCE_004.md](../../docs/EVIDENCE_004.md): what was tested and what is still open.
- Prompt: `hint.v2` ([002 prompts.md changelog](../002-ai-answer-check-and-hints/contracts/prompts.md)).

## Known limitations

- **Not live-verified before deploy** (owner decision): the owner checks on the deployed site.
  If a model rejects function calling, Gemini answers 400, which is terminal: hints show the safe
  message and credits are kept. Rollback: revert the 003 commit.
- Not the two-call "model reads data through the tool" loop of Session 004.
