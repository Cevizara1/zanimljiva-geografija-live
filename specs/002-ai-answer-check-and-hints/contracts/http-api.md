# Contract: Browser ↔ Backend HTTP API

Both endpoints: `POST`, `Content-Type: application/json`, body ≤ 4 KB, strict schemas (unknown
keys rejected). Every response is JSON with `Cache-Control: no-store`. Error bodies never
contain stack traces, provider text, model names or the key.

## `POST /api/check-round`

### Request

```json
{
  "letter": "D",
  "answers": {
    "country": "Danska", "city": "", "river": "Dunav", "mountain": "Durmitor",
    "sea": "Crno more", "animal": "Delfin", "plant": "Dud", "thing": "Kxq"
  }
}
```

- `letter` ∈ the 26 letters; `answers` has exactly the 8 category keys; each value a string
  ≤ 40 characters (may be empty).
- The server re-runs the local rule itself; it never trusts a client-side verdict.

### Success — `200`

```json
{
  "ok": true,
  "verified": true,
  "points": 50,
  "lines": [
    { "category": "country",  "written": "Danska",    "status": "accepted", "recognizedName": "Danska",   "reason": null,                  "example": null,      "noKnownTerm": false, "points": 10 },
    { "category": "city",     "written": "",          "status": "empty",    "recognizedName": null,       "reason": null,                  "example": "Dablin",  "noKnownTerm": false, "points": 0 },
    { "category": "sea",      "written": "Crno more", "status": "rejected", "recognizedName": null,       "reason": "ne počinje slovom D", "example": null,      "noKnownTerm": true,  "points": 0 },
    { "category": "thing",    "written": "Kxq",       "status": "rejected", "recognizedName": null,       "reason": "ne počinje slovom D", "example": "Daska",   "noKnownTerm": false, "points": 0 }
  ]
}
```

(`lines` always has 8 entries in category order; shortened here.)

### Failure

| HTTP | Body | When | AI calls |
| --- | --- | --- | --- |
| 400 | `{ "ok": false, "code": "INVALID_REQUEST", "retryable": false, "message": "Zahtev nije ispravan." }` | schema/size/JSON failure | 0 |
| 405 | `{ "ok": false, "code": "METHOD_NOT_ALLOWED", … }` | not POST | 0 |
| 429 | `{ "ok": false, "code": "RATE_LIMITED", "retryable": true, "message": "Previše provera za kratko vreme. Sačekaj malo." }` | local limiter | 0 |
| 503 | `{ "ok": false, "code": "AI_NOT_CONFIGURED", "retryable": false, "message": "AI provera nije podešena." }` | no key | 0 |
| 503 | `{ "ok": false, "code": "AI_UNAVAILABLE", "retryable": true, "message": "AI provera trenutno nije dostupna. Runda je bodovana bez provere." }` | chain exhausted, deadline, refusal, invalid output, 400/401/403 from provider | ≥ 1 |
| 503 | `{ "ok": false, "code": "AI_QUOTA_EXHAUSTED", "retryable": false, "message": "Dnevni limit AI provera je potrošen. Igra radi dalje, a odgovori se boduju samo po početnom slovu do sutra oko 9h." }` | every model out of its daily quota (added 2026-09-30, plan A) | 0 if already known, else one per model |

The browser treats every non-`ok` response, a `fetch` rejection and its own 22 s timeout the
same way: local score, "nije provereno", **Proveri ponovo** when `retryable` (or on network
failure).

## `POST /api/hint`

### Request

```json
{ "letter": "A", "category": "country" }
```

### Success — `200`

```json
{ "ok": true, "kind": "clue", "category": "country", "clue": "Ljudi iz ove zemlje prvi su sleteli na Mesec." }
```

```json
{ "ok": true, "kind": "no_known_term", "category": "sea" }
```

`kind: "clue"` is the only response that spends a credit.

### Failure

Same table as above with hint wording (`"Hint trenutno nije dostupan. Kredit nije potrošen."`;
for `AI_QUOTA_EXHAUSTED`: `"Dnevni limit za hintove je potrošen. Kredit nije potrošen."`),
client timeout 11 s. A failed hint never spends a credit.

## `GET /api/health`

`200 { "status": "ok", "ai": "configured" | "not_configured" }` — never reveals the key, model
chain or limits. The browser uses `ai` to show hints as unavailable up front.
