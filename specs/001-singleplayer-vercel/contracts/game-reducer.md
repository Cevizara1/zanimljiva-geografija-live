# Contract: Game Reducer and Screens

The reducer (`src/client/state/game-reducer.ts`) is pure: `(state, event) → state`.
Time enters only through events that carry `now`.

## Events

| Event | Payload | Allowed in | Effect |
| --- | --- | --- | --- |
| `START` | `now`, `letters` (5 distinct, drawn by caller) | `idle`, `game_results` | new game, round 1 `countdown` |
| `TICK` | `now` | any | `countdown→answering` at `startsAt`; ends round at `endsAt` (once) |
| `ANSWER_CHANGED` | `category`, `value` (≤ 40) | `answering`, `now < endsAt` | updates the current round's answer |
| `FINISH` | `now` | `answering` | ends the round (`endedBy: "finish"`); idempotent |
| `ROUND_SCORED` | `RoundResult` | `round_ended` (002: `checking`) | stores result, adds to total, `round_results` |
| `NEXT` | `now` | `round_results` | next round `countdown`, or `game_results` after round 5 |

Invalid events for the current phase return the same state object (no mutation), and a
unit test asserts reference equality for each rejected transition.

## Screens

| Phase | Screen | Kept from today |
| --- | --- | --- |
| `idle` | StartScreen: title, one-paragraph rules, **Nova igra** | page shell, header, theme toggle |
| `countdown` | CountdownScreen | unchanged |
| `answering` | AnswerScreen: current letter, timer, sheet with earlier rounds filled read-only | sheet table, timer styling, labels |
| `round_ended` / `checking` | AnswerScreen locked + "Proveravamo odgovore…" (002) | — |
| `round_results` | ResultsScreen: this round's line with status/points, **Sledeća runda** | scoresheet table styles |
| `game_results` | ResultsScreen: five lines, total, **Nova igra** | scoresheet table styles |
