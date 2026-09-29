# Data Model: Single-Player Game

All state lives in the browser tab, in one pure reducer. Nothing is persisted except the
theme choice (`localStorage["zg-theme"]`, unchanged).

## Constants (`src/contracts/game.schemas.ts`)

| Name | Value |
| --- | --- |
| `CATEGORIES` | country, city, river, mountain, sea, animal, plant, thing (labels unchanged) |
| `LETTERS` | A B C Č Ć D E F G H I J K L M N O P R S Š T U V Z Ž (26) |
| `ROUNDS_PER_GAME` | 5 |
| `COUNTDOWN_MS` | 3,000 |
| `ROUND_DURATION_MS` | 150,000 |
| `MAX_ANSWER_LENGTH` / `MIN_ANSWER_LENGTH` | 40 / 2 |
| `POINTS_ACCEPTED` | 10 |

## Entities

### Game

| Field | Type | Rule |
| --- | --- | --- |
| `letters` | `Letter[5]` | distinct, drawn once at game start |
| `rounds` | `Round[]` | length 1..5; index = round number − 1 |
| `current` | `number` | index of the round being played or last shown |
| `phase` | see state machine | |
| `total` | `number` | sum of scored rounds' points |

### Round

| Field | Type | Rule |
| --- | --- | --- |
| `letter` | `Letter` | from `Game.letters[index]` |
| `startsAt`, `endsAt` | epoch ms | `startsAt = startedAt + COUNTDOWN_MS`; `endsAt = startsAt + ROUND_DURATION_MS` |
| `answers` | `Record<Category, string>` | ≤ 40 chars each; editable only while `answering` |
| `endedBy` | `"finish" \| "deadline"` | set once |
| `result` | `RoundResult \| null` | set once when scored |

### RoundResult

| Field | Type | Notes |
| --- | --- | --- |
| `lines` | `CategoryResult[8]` | in `CATEGORIES` order |
| `points` | `number` | 0..80 |
| `verified` | `boolean` | always `false` in 001 (local rule); 002 sets `true` on AI success |

### CategoryResult

| Field | Type | Notes |
| --- | --- | --- |
| `category` | `Category` | |
| `written` | `string` | as typed |
| `status` | `"accepted" \| "rejected" \| "empty"` | |
| `reason` | `string \| null` | 001: `"prekratko"` or `"ne počinje slovom X"`; 002 adds AI reasons |
| `points` | `0 \| 10` | |

002 extends `CategoryResult` with `recognizedName` and `example` (see 002 data-model).

## State machine (`Game.phase`)

```text
idle ──START──▶ countdown ──now ≥ startsAt──▶ answering
                                              │
                         FINISH or now ≥ endsAt (once)
                                              ▼
                                         round_ended ──(001: score locally at once;
                                              │         002: checking → scored)
                                              ▼
                                         round_results ──NEXT (index < 4)──▶ countdown
                                              │
                                         NEXT (index = 4)
                                              ▼
                                         game_results ──START──▶ countdown (new game)
```

- `FINISH` and the deadline both lead to one transition; a second `FINISH` is ignored.
- `ANSWER_CHANGED` is ignored outside `answering` and when `now ≥ endsAt`.
- `NEXT` is ignored until the round's `result` exists.
