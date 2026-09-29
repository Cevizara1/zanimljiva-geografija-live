# Research: Single-Player Game Hostable on Vercel

All sources were read on 2026-09-30.

## R1. Can the current multiplayer run on Vercel?

- **Decision**: No. Remove multiplayer (owner's instruction for this case).
- **Rationale**: the game needs a long-lived Socket.IO connection per player, rooms and
  deadline timers held in one process's memory, and a writable SQLite file. Vercel Functions
  are request-scoped: no persistent WebSocket server, no guaranteed shared memory between
  invocations, no persistent disk.
- **Alternatives considered**: (a) a hosted real-time service (Pusher/Ably/Liveblocks) plus a
  KV store for rooms and deadlines — two new external services and a full rewrite of the
  authority model; rejected by constitution VII and the owner's rule. (b) Deploying the
  Node server to a WebSocket-capable host (Render/Fly) — contradicts the Vercel requirement.

## R2. Vercel function format and TypeScript

- **Decision**: one file per endpoint in `api/` exporting the Web-standard handler
  `export default { async fetch(request: Request): Promise<Response> }`, Node.js runtime.
  All code reachable from `api/` (`src/domain`, `src/contracts`, `src/server`) uses **relative
  imports**; an ESLint `no-restricted-imports` rule forbids `@domain/*`, `@contracts/*` and
  `@server/*` inside those folders. The client may keep its aliases (Vite resolves them).
- **Rationale**: Vercel's Node runtime docs state TypeScript in `/api` is supported, but
  *"Most options are supported aside from Path Mappings and Project References."* The
  `fetch` export takes a standard `Request`, so handlers are unit-testable without HTTP.
- **Alternatives considered**: a captured Node `server.ts` (keeps one server, but re-creates
  the long-running-process model and routes everything through one function); `(req, res)`
  Vercel helpers (needs `@vercel/node` types, harder to test).
- **Source**: https://vercel.com/docs/functions/runtimes/node-js

## R3. Local development without a Vercel account

- **Decision**: a small Vite plugin (`src/client/dev/api-middleware.ts`, dev/preview only)
  that routes `/api/<name>` to `api/<name>.ts` through `server.ssrLoadModule`, converts the
  Node request into a `Request`, and writes the `Response` back. `.env` is loaded into
  `process.env` for the middleware only (never into `import.meta.env`).
- **Rationale**: keeps `npm run dev` a single process, executes the exact handler files that
  Vercel deploys, and needs no `vercel` CLI or login.
- **Alternatives considered**: `vercel dev` (requires the CLI and a Vercel login — breaks the
  "only enter the key" promise); keeping the tsx Node server behind the Vite proxy (two
  processes and a second copy of routing that Vercel does not use).

## R4. Client-owned timing

- **Decision**: the reducer stores `startsAt` and `endsAt` (epoch ms) for the current round
  and derives phase and remaining time from an injected `now`; a 250 ms interval only
  re-renders. When `now ≥ endsAt` the reducer ends the round exactly once.
- **Rationale**: browsers throttle background timers; deriving from timestamps means a
  backgrounded tab cannot extend a round (SC-005). Injected `now` makes it testable without
  fake timers.

## R5. Letter drawing and matching

- **Decision**: `drawLetters(rng, 5)` — partial Fisher-Yates over the 26-letter array with an
  injected RNG (`crypto.getRandomValues` in the browser). Matching per GAME_SPEC §5.1-5.2:
  1. normalize: NFKC → trim → collapse spaces → Cyrillic→Latin (Љ→lj, Њ→nj, Џ→dž, Ђ→đ, …) →
     `toLocaleLowerCase("sr-Latn")`;
  2. local check: fold (č,ć→c; š→s; ž→z; đ→dj; dž→dz) both the answer and the round letter,
     then `startsWith`;
  3. recognised-name check (used by 002): exact prefix on the unfolded name, where D also
     accepts Đ/Dž, L accepts Lj, N accepts Nj, and C/S/Z do **not** accept Č/Ć/Š/Ž.
- **Rationale**: one pure module owns both steps, and every row of GAME_SPEC §5.2 becomes a
  table-driven test. The owner chose the 26-letter set (Q1-B).

## R6. Test inventory

| Test file | Fate | Why |
| --- | --- | --- |
| `tests/integration/*` (8 files) | delete | cover rooms, sockets, accounts, matchmaking — all removed |
| `tests/helpers/*` (3 files) | delete | Socket.IO clients, test server, test clock for the removed server |
| `tests/unit/account-contracts.test.ts`, `account-store.test.ts` | delete | accounts removed |
| `tests/unit/room-store.test.ts`, `server-primitives.test.ts`, `config.test.ts` | delete | room store, clock/ids/server letters, W03 server config removed (002 adds its own config test) |
| `tests/unit/score-category.test.ts` | replace | traditional two-player scoring removed; `score-round.test.ts` covers 10/0 |
| `tests/unit/game-state.test.ts` | replace | socket-event reducer removed; `game-reducer.test.ts` covers the new one |
| `tests/unit/contracts.test.ts` | adapt | socket schemas removed; game schema cases kept |
| `tests/unit/normalize-answer.test.ts`, `validate-answer.test.ts` | keep + extend | behavior retained; new script/diacritic cases added |
| `tests/unit/answer-sheet.test.ts`, `theme.test.ts` | keep / adapt | design retained |

## R7. Documentation that would become false

- **Decision**: move `Plan.md` and `.github/instructions/*` + `.github/00-index.instructions.md`
  to `docs/archive/w03/`; replace `.github/copilot-instructions.md`, `AGENTS.md` and `CLAUDE.md`
  with short pointers to the constitution, GAME_SPEC and `specs/`. W03 evidence files
  (`EVIDENCE_003.md`, `EVALS.md`, `BUILD_PROMPT_V1.md`, `CONTEXT_MANIFEST.md`) stay in `docs/`
  unchanged, with one header line noting they describe the Week 3 system.
- **Rationale**: constitution governance; the owner's "keep the audit trail honest" rule.
