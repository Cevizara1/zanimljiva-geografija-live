# Implementation Plan: Single-Player Game Hostable on Vercel

**Branch**: `001-singleplayer-vercel` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-singleplayer-vercel/spec.md`

## Approval

2026-09-30 — the owner approved: (1) deleting multiplayer, accounts and their tests (R6);
(2) archiving `Plan.md` and `.github/instructions/*` to `docs/archive/w03/` (R7); (3) words
starting with Lj/Nj/Dž/Đ count for L/N/D, and "Amerika" is accepted for SAD (GAME_SPEC §4, §5.2);
(4) hint credits enforced in the browser, protected server-side only by a rate limit.

## Summary

Turn the two-player Socket.IO game with SQLite accounts into a single-player, five-round game
that runs entirely in the browser, backed only by stateless Vercel functions under `/api`.
The game loop (letters, countdown, timer, rounds, local scoring) moves into a pure client
reducer; all real-time, room, account and database code is deleted. The existing CSS, doodle
assets, theme toggle and paper-sheet markup are kept; the sheet's five ruled lines become the
five rounds. Letters widen to the 26-letter set with digraph-aware matching. Local development
stays one command (`npm run dev`), and the repo is ready to import into Vercel.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict); Node.js ≥22 locally (24 in use), Node 24 on Vercel

**Primary Dependencies**: React 18, Vite 5, zod 3 (kept). Removed: `socket.io`,
`socket.io-client`, `concurrently`, `tsup`. No dependency is added by this feature.

**Storage**: none (game state lives in the tab; theme choice stays in `localStorage`)

**Testing**: Vitest 2 (unit tests for the domain and the client reducer; handler tests call the
`api/*.ts` `fetch` export directly with a `Request`)

**Target Platform**: Vercel (static `dist/client` + Node functions in `api/`); local dev via Vite

**Project Type**: web application (SPA + stateless serverless functions in one repository)

**Performance Goals**: UI tick 250 ms; round end detected within 1 s of the deadline (SC-005)

**Constraints**: no DB, no persistent server state, no WebSocket; code imported by `api/` may
not use tsconfig path aliases (Vercel does not support path mappings — see research R2)

**Scale/Scope**: one player per tab; 8 categories × 5 rounds; ~6 screens reduced to 4

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan complies |
| --- | --- | --- |
| I. Secrets server-only | ✅ | This feature adds no secret; `.env.example` lists `GEMINI_API_KEY` for 002; Vite exposes only `VITE_*` vars to the client and none are defined |
| II. Model suggests, app decides | n/a | No AI in 001; local letter rule is pure domain code reused by 002 |
| III. Bounded reliability | n/a | No provider calls in 001 |
| IV. Game works without AI | ✅ | 001 *is* the no-AI game; its local scoring is 002's fallback path |
| V. Fake first | ✅ | All tests offline; no network |
| VI. Contracts at boundaries | ✅ | Letters/categories/answers stay zod schemas; reducer events typed from them |
| VII. Stateless simplicity | ✅ | Deletes the DB, rooms, sockets and accounts; no new dependency |
| VIII. Telemetry | n/a | No AI calls in 001 |

**Test deletion note (honesty rule)**: tests are deleted only together with the feature they
test (rooms, sockets, accounts, matchmaking). Each deleted test file is listed in
[research.md R6](research.md#r6-test-inventory) with the removed code it covered. No test of
retained behavior is deleted or weakened.

## Before / after matrix (contract and surface changes)

| Surface | Before | After |
| --- | --- | --- |
| HTTP | `/api/auth/*`, `/api/me/*` (accounts), `/healthz`, static SPA from Node | `/api/health` only (002 adds `/api/check-round`, `/api/hint`); SPA served by Vercel static hosting |
| Real-time | Socket.IO events `room:*`, `round:*`, `game:error` | none |
| Storage | `data/players.sqlite` (accounts, sessions, history) | none |
| Server process | long-running `node dist/server/index.js`, in-memory rooms, timers | stateless functions; no timers |
| Game authority | server: letter, `startsAt/endsAt`, locks, scores | client reducer: letters, timing, locks, local score (single player, nothing to cheat against) |
| Letters | 7: A B D K M S V | 26: A B C Č Ć D E F G H I J K L M N O P R S Š T U V Z Ž, 5 distinct per game |
| Matching | NFKC + trim + lowercase `startsWith` | + Cyrillic→Latin, diacritic folding, digraph rules (GAME_SPEC §5.1-5.2) |
| Scoring | 10/10, 5/5, 10/0, 0/0 vs opponent | 10 accepted / 0 otherwise |
| Rounds | 1 per room | 5 per game |
| Screens | Account, Profile, Lobby, Join, Searching, Waiting, Countdown, Answer, WaitingForOpponent, Results | Start, Countdown, Answer, Results (round + final) |
| Env vars | PORT, NODE_ENV, ROUND_DURATION_MS, COUNTDOWN_MS, room TTLs | `GEMINI_API_KEY` (+ 002's optional AI settings); round/countdown become client constants |
| Scripts | dev (tsx + vite), build (vite + tsup), start | dev (vite + dev API middleware), build (vite), preview, verify |
| Docs | Plan.md, `.github/instructions/*` (W03 rules), GAME_SPEC v1 | archived under `docs/archive/w03/`; constitution + GAME_SPEC v2 + specs are current |

## Project Structure

### Documentation (this feature)

```text
specs/001-singleplayer-vercel/
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1 — game/round state machine
├── quickstart.md        # Phase 1 — run & validate
├── contracts/
│   └── game-reducer.md  # Phase 1 — reducer events and screen contract
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
api/
└── health.ts                    # GET → { status: "ok" }  (002 adds check-round.ts, hint.ts)

src/
├── contracts/
│   └── game.schemas.ts          # categories, 26 letters, answer bounds (relative imports only)
├── domain/                      # pure; relative imports only (reachable from api/)
│   ├── normalize-answer.ts      # trim/collapse/lowercase + Cyrillic→Latin
│   ├── fold-letters.ts          # diacritic folding for the local check
│   ├── letter-match.ts          # GAME_SPEC §5.2 both steps (written form, recognised name)
│   ├── validate-answer.ts       # local rule: ≥2 letters + letter-match on written form
│   ├── draw-letters.ts          # 5 distinct letters from an injected RNG
│   └── score-round.ts           # 10/0 per category, round total
└── client/
    ├── main.tsx, App.tsx        # App = screen switch over the game reducer
    ├── state/game-reducer.ts    # pure reducer + selectors (clock injected as `now`)
    ├── state/useGame.ts         # React binding: dispatch, 250 ms tick
    ├── screens/StartScreen.tsx      # replaces Lobby (Nova igra)
    ├── screens/CountdownScreen.tsx  # kept
    ├── screens/AnswerScreen.tsx     # kept markup; earlier rounds on lines 1..n-1
    ├── screens/ResultsScreen.tsx    # one-player scoresheet: round result + final total
    ├── ThemeToggle.tsx, theme.ts, strings.ts, app.css, assets/   # kept
    (dev plugin: src/dev/vite-api-plugin.ts — Vite dev/preview plugin that serves api/*.ts locally)

tests/
├── unit/  normalize-answer, letter-match, validate-answer, draw-letters, score-round,
│          game-reducer, answer-sheet (adapted), theme (kept), contracts (adapted)
└── api/   health.test.ts (calls the fetch export directly)

vercel.json                      # buildCommand, outputDirectory dist/client, functions maxDuration
.env.example                     # GEMINI_API_KEY= (+ optional AI settings, see 002)
```

**Deleted**: `src/server/**` (rooms, socket, accounts, clock, ids, letters, config, index),
`src/client/socket/**`, `src/client/accounts/**`, `src/client/PlayerApp.tsx`,
`src/client/state/useGameState.ts`, screens Account, Profile, Lobby, Join, Searching,
Waiting, WaitingForOpponent, `src/contracts/socket.schemas.ts`, `account.schemas.ts`,
`errors.ts` (W03 socket error registry), `tests/integration/**`, `tests/helpers/**`, and the
unit tests listed in research R6. `data/` is already git-ignored; it is removed locally.

**Structure Decision**: one repository, Vercel's zero-config layout — `api/` at the root for
functions, Vite SPA built to `dist/client`. Shared pure code lives in `src/domain` and
`src/contracts` and is imported by both sides through relative paths.

## Implementation order (for /speckit-tasks)

1. Domain first (TDD): normalization + transliteration, folding, letter-match (all GAME_SPEC
   §5.2 rows as tests), local validity, draw-letters (1,000-game simulation), 10/0 scoring.
2. Game reducer (TDD): start → countdown → answering → round-ended → results → next / final,
   deadline from `startsAt` with injected `now`, idempotent finish.
3. UI: StartScreen; adapt AnswerScreen (earlier lines filled, read-only), ResultsScreen
   (single player), App switch; keep CSS untouched except removing dead selectors.
4. Delete multiplayer/accounts code, dependencies, and their tests (R6 inventory).
5. `api/health.ts`, Vite dev middleware, `vercel.json`, `.env.example`, scripts.
6. Relative-import conversion for `src/domain`, `src/contracts` + ESLint guard (R2).
7. Docs: archive W03 docs (FR-016), rewrite README, AGENTS.md/CLAUDE.md, copilot-instructions.
8. `npm run verify`; manual five-round play in light and dark theme; screenshots.

## Complexity Tracking

No constitution violations to justify.
