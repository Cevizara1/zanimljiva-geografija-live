# Data Model: AI Answer Check and Hint Credits

Every shape below is a zod schema in `src/contracts/` with its TypeScript type inferred.
Browser-facing shapes are in [contracts/http-api.md](contracts/http-api.md); model-facing
shapes are in [contracts/ai-provider-contract.md](contracts/ai-provider-contract.md).

## Client game state additions (extends 001 data-model)

| Field | Type | Rule |
| --- | --- | --- |
| `Game.hintCredits` | `0..3` | starts at 3; −1 only on a successful `clue` hint response |
| `Round.hints` | `Partial<Record<Category, HintView>>` | at most one per category per round |
| `Round.pendingHint` | `Category \| null` | one hint request at a time; aborted when the round ends |
| `RoundResult.verified` | `boolean` | `true` only from an `ok: true` check response |
| `RoundResult.unverifiedReason` | `"temporary" \| "not_configured" \| null` | drives the message and the **Proveri ponovo** button |
| `CategoryResult.recognizedName` | `string \| null` | shown in place of the written answer when accepted |
| `CategoryResult.example` | `string \| null` | only for rejected/empty lines |
| `CategoryResult.noKnownTerm` | `boolean` | "nema poznatog pojma na ovo slovo" |
| `Game.phase` | + `checking` | between `round_ended` and `round_results` |

`HintView = { status: "loading" } | { status: "shown"; clue: string } | { status: "no_term" } | { status: "failed" }`

### Transitions added

```text
answering ──FINISH / deadline──▶ checking ──CHECK_OK──────▶ round_results (verified)
                                    └─────CHECK_FAILED──▶ round_results (local score, unverified)
round_results (unverified) ──RECHECK──▶ checking-again ──OK──▶ round_results (verified; total recomputed)
                                                       └─FAIL─▶ round_results (unchanged)
answering ──HINT_REQUESTED(cat)──▶ hints[cat]=loading (only if credits>0, no hint yet, none pending)
   HINT_OK(clue)  → hints[cat]=shown, credits−1
   HINT_NO_TERM   → hints[cat]=no_term, credits unchanged
   HINT_FAILED    → hints[cat]=failed (control re-enabled), credits unchanged
   round ends     → pending hint aborted; hints[cat] cleared if still loading; credits unchanged
```

`NEXT` stays disabled while `checking`.

## Server-side types (`src/server/ai/types.ts`)

```text
AiOperation      = "check-round" | "hint"
AttemptKind      = "initial" | "retry" | "fallback"
AiFailureCode    = invalid_request | auth_config | not_configured | model_unavailable | timeout
                 | transport | rate_limited | provider_transient | safety_refusal
                 | invalid_output:truncated | invalid_output:empty | invalid_output:json
                 | invalid_output:schema | invalid_output:semantic | cancelled | deadline_exhausted

AiRequest<TIn>   = { operation, promptVersion, systemInstruction, input: TIn,
                     responseJsonSchema, maxOutputTokens, budget: RetryBudget, interactionId }
AiResult<TOut>   = { ok: true, output: TOut, model, fallbackUsed, attempts, usage? }
                 | { ok: false, code: AiFailureCode, retryable: boolean, fallbackUsed, attempts }
ProviderAttempt  = { n, provider: "gemini", model, kind: AttemptKind, status: "success" | "failure",
                     errorClass?, httpStatus?, latencyMs }
TokenUsage       = { inputTokens?, outputTokens?, totalTokens? }   # from usageMetadata, never estimated
```

## Telemetry record (one per logical interaction)

```json
{
  "event": "ai.interaction",
  "interactionId": "ai-7f3c…",
  "operation": "check-round",
  "promptVersion": "check-round.v2",
  "outcome": "success",
  "fallbackUsed": true,
  "attempts": [
    { "n": 1, "model": "gemini-3.5-flash-lite", "kind": "initial", "status": "failure", "errorClass": "provider_transient", "httpStatus": 503, "latencyMs": 812 },
    { "n": 2, "model": "gemini-3.5-flash-lite", "kind": "retry", "status": "failure", "errorClass": "provider_transient", "httpStatus": 503, "latencyMs": 790 },
    { "n": 3, "model": "gemini-3.1-flash-lite", "kind": "fallback", "status": "success", "latencyMs": 1630 }
  ],
  "totalLatencyMs": 3610,
  "usage": { "inputTokens": 612, "outputTokens": 240, "totalTokens": 852 },
  "itemsJudged": 5,
  "itemsExampleOnly": 3,
  "overrides": 0,
  "examplesDropped": 0
}
```

Never present: API key, prompt text, provider reply text, player answers, IP address.
