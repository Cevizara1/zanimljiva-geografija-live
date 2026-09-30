# Tool Contract — `show_hint` (W04 Session 004)

Spec: [specs/003-hint-tool-call](../specs/003-hint-tool-call/spec.md). Code:
`src/server/tools/show-hint.ts` (tool, allowlist) and `src/server/features/hint.ts`
(`gateHintToolCall`, `runHint`). Tests: `tests/unit/hint-tool-gate.test.ts`,
`tests/api/hint.test.ts`, `tests/unit/gemini-adapter.test.ts`.

## Purpose

The hint model answers by **proposing a call** to one tool, `show_hint`. The arguments are the
hint. The server decides whether the call may run; the model never executes anything.

**One provider call per hint.** Classic tool use is two model calls: the model asks for data,
the app returns the tool result, the model answers. Here the model already gets everything it
needs (letter and category) in the request, and the tool's result goes to the player, not back
to the model. Owner decision (2026-09-30): the free-tier quota is not spent twice per hint.

## Definition

| Field | Value |
| --- | --- |
| Name | `show_hint` (the only name in the allowlist `HINT_TOOLS`) |
| Mode | `read-only`: a pure function of its arguments; reads and writes no state, credits or storage |
| Scope | the request's own `letter` and `category`, nothing else |
| Owner | server (`src/server/tools/show-hint.ts`) |
| Side effects | none |
| Timeout | the hint attempt's 4 s / total 9 s (the tool itself is synchronous and bounded) |
| Max calls | exactly 1 per model reply (`maxSteps` = 1, no loop) |
| Provider config | `tools[0].functionDeclarations = [show_hint]`, `toolConfig.functionCallingConfig = { mode: "ANY", allowedFunctionNames: ["show_hint"] }` |

### Arguments (`parametersJsonSchema`, strict; zod `showHintArgsSchema` mirrors it)

| Argument | Type | Rule |
| --- | --- | --- |
| `letter` | enum of the 26 round letters | must equal the request's letter |
| `category` | enum of the 8 categories | must equal the request's category |
| `term` | string ≤ 60, no control characters | the described term; never leaves the server |
| `termEn` | string ≤ 60 | its English name, or `""` |
| `clue` | string ≤ 200 | 1–2 Serbian sentences |
| `noKnownTerm` | boolean | true only if no real term exists |

`additionalProperties: false`: an argument the contract does not list rejects the call.

### Output to the browser (unchanged public contract, `hintSuccessSchema`)

```ts
{ ok: true, kind: "clue", category, clue } | { ok: true, kind: "no_known_term", category }
```

The UI shows `clue` as plain text; nothing from the model is interpreted as a command.

## Gate (order matters, all before execution)

```text
model reply
 → 0 calls?            tool:missing_call
 → more than 1 call?   tool:too_many_calls
 → name allowlisted?   tool:unknown
 → args strict schema? tool:invalid_args        e.g. {"detail":"everything","executeCode":"..."}
 → letter/category = request?  tool:out_of_scope
 → tool is read-only?  tool:out_of_scope
 → execute show_hint (read-only)
     → term on the letter, clue 10-200 chars, no part of the term → clue | no_known_term
     → otherwise invalid_output:semantic
```

Text the model writes next to the call is ignored. Every refusal is **terminal**: no retry and no
fallback to another model (W04 reliability addendum §3.1, `missing-tool-call`). The player gets
the safe message *"Hint trenutno nije dostupan. Kredit nije potrošen."* (HTTP 503,
`AI_UNAVAILABLE`, `retryable: false`) and keeps the credit. Transport failures (timeout, 429,
5xx) keep the existing bounded retry and model fallback.

## Test matrix

| Case | Expected | Test |
| --- | --- | --- |
| valid call | tool runs once, clue returned | `hint-tool-gate` "returns the clue"; `hint.test` H01 |
| invalid args (PDF example, extra keys, missing, wrong type, not an object) | `tool:invalid_args`, **callCount = 0** | `hint-tool-gate` |
| unsupported tool / empty name | `tool:unknown`, callCount = 0 | `hint-tool-gate`; `hint.test` T-tool |
| no tool call | `tool:missing_call`, callCount = 0, 1 provider call | `hint-tool-gate`; `hint.test` T-tool |
| two calls | `tool:too_many_calls`, callCount = 0 | both |
| another letter or category | `tool:out_of_scope`, callCount = 0 | both |
| a write tool in the registry | never executed | `hint-tool-gate` |
| malformed final output (clue names the term, wrong letter, too short) | `invalid_output:semantic` | `hint-tool-gate`; `hint.test` H02/H04 |
| timeout / provider failure | bounded retry, fallback, then safe failure | `hint.test` "uses the hint budget"; gateway tests |
| invalid request from the browser | 400, 0 provider calls | `hint.test` |
| telemetry | outcome code only; tool arguments never logged | `hint.test` T-tool |
| wire format | tool declared and forced, no JSON response format | `hint.test`; `gemini-adapter.test` |
