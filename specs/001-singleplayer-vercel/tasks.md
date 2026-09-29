---
description: "Task list for 001 — single-player game hostable on Vercel"
---

# Tasks: Single-Player Game Hostable on Vercel

**Input**: `specs/001-singleplayer-vercel/` — plan.md, spec.md, research.md, data-model.md,
contracts/game-reducer.md, quickstart.md
**Tests**: required (constitution V; test-first for domain and reducer)
**Rules owner**: `docs/GAME_SPEC.md` §3, §5.1-§5.2, §6, §8

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Remove `socket.io`, `socket.io-client`, `concurrently`, `tsup` from package.json; set scripts `dev: vite`, `build: vite build`, `preview: vite preview`, `test`, `typecheck`, `lint`, `verify: typecheck && lint && test && build`; run `npm install`
- [x] T002 [P] Add `vercel.json` (`buildCommand: "npm run build"`, `outputDirectory: "dist/client"`, `functions: { "api/*.ts": { "maxDuration": 30 } }`)
- [x] T003 [P] Rewrite `.env.example` to `GEMINI_API_KEY=` plus commented optional AI settings (002)
- [x] T004 [P] ESLint: forbid `@domain/*`, `@contracts/*`, `@server/*` imports inside `src/domain`, `src/contracts`, `src/server`, `api` (no-restricted-imports; research R2) in eslint.config.js; add `api/**` to the `no-restricted-globals` exemption list only where needed

## Phase 2: Foundational (domain + contracts, blocking)

- [x] T005 Rewrite constants in src/contracts/game.schemas.ts: `LETTERS` = the 26 letters "A B C Č Ć D E F G H I J K L M N O P R S Š T U V Z Ž", `ROUNDS_PER_GAME = 5`, `COUNTDOWN_MS = 3000`, `ROUND_DURATION_MS = 150000`, `MAX_ANSWER_LENGTH = 40`, `MIN_ANSWER_LENGTH = 2`, `POINTS_ACCEPTED = 10`; drop room/player/socket/server-config schemas; relative imports only
- [x] T006 [P] Test first: tests/unit/normalize-answer.test.ts — keep existing cases; add Cyrillic→Latin (Љ→lj, Њ→nj, Џ→dž, Ђ→đ, Ћ→ć, Ч→č, Ш→š, Ж→ž), mixed script, spaces, case
- [x] T007 [P] Test first: tests/unit/letter-match.test.ts — every row of GAME_SPEC §5.2 for both the written-form check and the recognised-name check (C≠Č/Ć, S≠Š, Z≠Ž, D⊇Đ/Dž, L⊇Lj, N⊇Nj)
- [x] T008 [P] Test first: tests/unit/draw-letters.test.ts — 5 distinct letters; 1,000 seeded games: 0 repeats, all 26 seen
- [x] T009 [P] Test first: tests/unit/score-round.test.ts — 10 per accepted, 0 per rejected/empty, max 80; `verified: false`; reasons "prekratko" / "ne počinje slovom X"
- [x] T010 Implement src/domain/normalize-answer.ts (NFKC → trim → collapse → transliterate → sr-Latn lowercase)
- [x] T011 Implement src/domain/fold-letters.ts and src/domain/letter-match.ts (`matchesWritten(answer, letter)`, `matchesRecognised(name, letter)`)
- [x] T012 Update src/domain/validate-answer.ts to return `{ ok } | { ok: false, reason }` using letter-match; update tests/unit/validate-answer.test.ts for the 26 letters
- [x] T013 [P] Implement src/domain/draw-letters.ts (partial Fisher-Yates, injected `rng: () => number`)
- [x] T014 Replace src/domain/score-category.ts with src/domain/score-round.ts (`scoreRoundLocally(answers, letter) → RoundResult`)
- [x] T015 Convert every import in src/domain and src/contracts to relative paths; `npm run lint` must pass the T004 rule

**Checkpoint**: `npm test -- tests/unit` green for domain.

## Phase 3: User Story 1 — five-round solo game (P1) 🎯 MVP

- [x] T016 [US1] Test first: tests/unit/game-reducer.test.ts — every event row of contracts/game-reducer.md; deadline from `endsAt` with injected `now`; idempotent FINISH; rejected events return the same state reference; round 5 → `game_results`; total = sum
- [x] T017 [US1] Implement src/client/state/game-reducer.ts (phases idle, countdown, answering, round_ended, round_results, game_results; `ROUND_SCORED`; selectors `remainingMs`, `msToStart`)
- [x] T018 [US1] Implement src/client/state/useGame.ts (useReducer, 250 ms TICK interval only in countdown/answering, `crypto.getRandomValues` RNG for START, local scoring on `round_ended`)
- [x] T019 [P] [US1] Create src/client/screens/StartScreen.tsx (title, short rules, **Nova igra**) reusing `.screen`, `.screen-title`, button styles
- [x] T020 [US1] Adapt src/client/screens/AnswerScreen.tsx: remove opponent note and draft-status text; lines 1..n-1 render earlier rounds read-only, line n editable, remaining lines blank `aria-hidden`
- [x] T021 [US1] Adapt src/client/screens/ResultsScreen.tsx to one player: rows = rounds played (letter as row head), cells with points/verdict/reason, total column; round view shows **Sledeća runda**, final view shows game total + **Nova igra**; honor-system note replaced by "nije provereno" note when `verified === false`
- [x] T022 [US1] Rewrite src/client/App.tsx as the phase → screen switch with header (brand + ThemeToggle); src/client/main.tsx renders App; update src/client/strings.ts (drop room/opponent/account copy, add start/round/next/final copy, move theme labels out of AUTH_SR)
- [x] T023 [US1] Adapt tests/unit/answer-sheet.test.ts to the single-player sheet (5 lines, earlier rounds read-only, no opponent note, no points while answering)
- [x] T024 [P] [US1] Adapt tests/unit/contracts.test.ts to the remaining schemas

## Phase 4: User Story 2 — same look (P1)

- [x] T025 [US2] Remove only dead CSS selectors from src/client/app.css (`.room-code*`, `.players`, `.code-input`, `.paths`, `.path*`, `.playing-as`, `.nav-who`, `.site-nav button.link*`, `.profile-*`, `.history*`, `.pager`, `.outcome-win/.outcome-loss` if unused); no change to colors, fonts, borders, doodles
- [ ] T026 [US2] Manual M6: screenshots of start/answer/results in light and dark (quickstart)

## Phase 5: User Story 3 — 26 letters (P2)

- [x] T027 [US3] Wire draw-letters into START; show the letter in CountdownScreen/AnswerScreen headers unchanged (covered by T008, T016)

## Phase 6: User Story 4 — deploy by setting one variable (P2)

- [x] T028 [US4] Test first: tests/api/health.test.ts — `GET` → 200 `{ status: "ok", ai: "not_configured" }` without key; `POST` → 405
- [x] T029 [US4] Implement api/health.ts (`export default { fetch }`)
- [x] T030 [US4] Implement src/client/dev/api-middleware.ts (Vite plugin, dev + preview: `/api/<name>` → `ssrLoadModule("/api/<name>.ts")`, Node req → `Request`, `Response` → res; loads `.env` into `process.env` for the middleware only) and register it in vite.config.ts
- [x] T031 [US4] Update vitest.config.ts: include `tests/**/*.test.ts`, coverage over src/domain, src/contracts, src/server, api

## Phase 7: Removal (approved 2026-09-30)

- [x] T032 Delete src/server/** (W03), src/client/socket/**, src/client/accounts/**, src/client/PlayerApp.tsx, src/client/state/useGameState.ts, screens Account/Profile/Lobby/Join/Searching/Waiting/WaitingForOpponent, src/contracts/socket.schemas.ts, account.schemas.ts, errors.ts
- [x] T033 Delete tests per research R6: tests/integration/**, tests/helpers/**, tests/unit/{account-contracts,account-store,room-store,server-primitives,config,score-category,game-state}.test.ts
- [x] T034 Remove local `data/` directory (ignored, not tracked)

## Phase 8: Polish & docs

- [x] T035 [P] Archive `Plan.md`, `.github/00-index.instructions.md`, `.github/instructions/*` to docs/archive/w03/ (git mv); replace `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md` with short pointers to the constitution, GAME_SPEC and specs/
- [x] T036 [P] Add a one-line "describes the Week 3 two-player system" header to docs/EVIDENCE_003.md, EVALS.md, BUILD_PROMPT_V1.md, CONTEXT_MANIFEST.md, PRODUCT_REVIEW.md
- [x] T037 Rewrite README.md: what the game is, `cp .env.example .env` → key → `npm install` → `npm run dev`, Vercel deploy steps, commands, known limitations (no resume after refresh)
- [ ] T038 Run `npm run verify` and record the real output in the handoff; manual M1-M7

## Dependencies

Setup → Foundational → US1 → (US2, US3, US4 in any order) → Removal → Polish.
T032/T033 may run as soon as US1 no longer imports the removed modules.

## Parallel examples

T006-T009 together (different test files); T019 with T020-T021 once T017 exists.

## Implementation strategy

MVP = Phases 1-3: a playable five-round game locally. Then removal, deploy wiring, docs.

## Status (2026-09-30)

All tasks implemented except manual checks. `npm run verify` passed in this session
(22 test files, 363 tests, build OK) — the automated half of T038.

- T026 / T038 manual M1-M7 (screenshots in light and dark, five-round play in a browser):
  **not done** — needs a person at a browser.
- Deviations: the dev API plugin lives at `src/dev/vite-api-plugin.ts` (it is Node code, not
  client code); handler factories live in `src/server/handlers/` so `api/*.ts` export only a
  default (Vercel treats every export in `api/` as part of the function).
