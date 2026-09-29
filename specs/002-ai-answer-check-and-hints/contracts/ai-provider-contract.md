# AI Provider Contract (W04 `AI_PROVIDER_CONTRACT`)

```text
Provider:   Google Gemini API (free tier), REST v1beta generateContent, plain fetch (no SDK)
Models:     GEMINI_MODEL_CHAIN, default "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.6-flash"
            (stable IDs only; allowlisted by config; the browser never selects a model)
            one model per request; the second only after a transient failure of the first
Why enough: short classification + well-known examples in Serbian/English; lite models only
            (owner decision); strict prompt; primary verified by live eval L2
Secrets:    GEMINI_API_KEY in server env only; sent as header x-goog-api-key
```

## Input (what leaves our server)

| Operation | Payload inside `contents[0].parts[0].text` (JSON) |
| --- | --- |
| check-round | `{"letter":"D","items":[{"category":"river","label":"Reka","answer":"Dunav"},{"category":"city","label":"Grad","answer":null}]}` — `answer: null` means "example only" |
| hint | `{"letter":"A","category":"country","label":"Država"}` |

The system instruction (`contracts/prompts.md`) goes in `systemInstruction`. Nothing else
is sent: no IP, no identifiers, no earlier rounds.

## Generation config

| Field | check-round | hint |
| --- | --- | --- |
| `responseMimeType` | `application/json` | `application/json` |
| `responseJsonSchema` | check schema below | hint schema below |
| `temperature` | 0 | 0.2 |
| `maxOutputTokens` | 1,500 | 300 |
| `thinkingConfig` | only if `GEMINI_THINKING_LEVEL` is set (capability-checked) | same |

## Output schemas (provider-side JSON Schema; zod mirrors them and adds length limits)

check-round:

```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array", "minItems": 1, "maxItems": 8,
      "items": {
        "type": "object",
        "properties": {
          "category": { "type": "string", "enum": ["country","city","river","mountain","sea","animal","plant","thing"] },
          "verdict": { "type": "string", "enum": ["accepted","rejected","not_judged"] },
          "recognizedSr": { "type": ["string","null"] },
          "recognizedEn": { "type": ["string","null"] },
          "reason": { "type": ["string","null"], "enum": ["ne_postoji","pogresna_kategorija","istorijski","nije_prepoznato", null] },
          "example": { "type": ["string","null"] },
          "noKnownTerm": { "type": "boolean" }
        },
        "required": ["category","verdict","recognizedSr","recognizedEn","reason","example","noKnownTerm"],
        "additionalProperties": false
      }
    }
  },
  "required": ["items"],
  "additionalProperties": false
}
```

hint:

```json
{
  "type": "object",
  "properties": {
    "term": { "type": ["string","null"] },
    "termEn": { "type": ["string","null"] },
    "clue": { "type": ["string","null"] },
    "noKnownTerm": { "type": "boolean" }
  },
  "required": ["term","termEn","clue","noKnownTerm"],
  "additionalProperties": false
}
```

Gemini documents no `anyOf` or nullable types for `responseJsonSchema`, so the implemented
schemas use `"type": "string"` with `""` meaning "no value" (and `""` in the reason enum);
validation maps `""` to null. The source of truth is `src/contracts/ai-output.schemas.ts`,
kept in parity with zod by `tests/unit/output-rules.test.ts`.

zod adds: strings ≤ 60 chars (names/examples), clue ≤ 200 chars (10-200 after validation),
control characters rejected.

## Timeout

check-round 6 s per attempt / 18 s total; hint 4 s / 9 s. Client-side 22 s / 11 s.

## Rotation

Model health per instance (research R3b): cooling models are skipped (1→15 min), models out of
daily quota until the Pacific-midnight reset. Flash models are sent `thinkingLevel: "minimal"`,
lite models no thinking option (override: `GEMINI_THINKING_LEVEL`).

## Retry policy

Bounded: ≤ 2 attempts per model, exponential backoff with full jitter (check 400 ms base,
hint 300 ms base, caps 2 s / 1.5 s), provider retry hint honored only within the remaining
budget, no attempt started with less than 2 s (check) / 1.5 s (hint) left. Retry the same
model only for `transport`, `rate_limited`, `provider_transient`; a `timeout` goes straight to
the next model (live finding 2026-09-30). Full table: research R5.

## Fallback

Sequential through the chain, only after a transient class or `model_unavailable`; never
for `invalid_request`, `auth_config`, `safety_refusal`, `invalid_output:*`. Retry and
fallback share one deadline. Exhausted chain → `AI_UNAVAILABLE` (retryable) → browser local
fallback. `fallbackUsed` is logged; it is not shown to the player.

## Validation (in order; any failure = not a success)

1. HTTP status ok, `promptFeedback.blockReason` absent, `finishReason` = `STOP`.
2. `candidates[0].content.parts[*].text` non-empty.
3. `JSON.parse`.
4. zod schema (strict).
5. Semantic rules (research R7): category-set equality, verdict/answer consistency, letter rule
   on recognised names (overrides), written-vs-recognised resemblance, example rules, hint
   leak rule.

## User-facing failure

Only the Serbian messages in `contracts/http-api.md`. The round is always scored (locally
if needed) and the game can always continue.

## Telemetry

One `ai.interaction` JSON line per request (data-model.md), to `console.info` (Vercel logs)
and to an injectable sink for tests. Live calls are additionally recorded by hand in
`docs/AI_USAGE_LOG.md` (date, commit, operation, model, attempts, outcome, latency, tokens).
