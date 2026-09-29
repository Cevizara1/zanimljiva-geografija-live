# AI_USAGE_LOG

One row per meaningful AI call. Phase, reason, expected result, actual result,
next decision. No private chain-of-thought, no secrets, no tokens, no private
URLs, no in-round answer payloads.

Budget: 10–15 meaningful coding-agent iterations across Weeks 3–4.
Used so far: **7** (entry 007 is one Week 4 session).

---

## 001 — Planning (ChatGPT / Codex, 2026-09-22)

- **Phase:** planning, before any code.
- **Reason:** turn the team's verbal requirements and the Week 3 brief into a
  written plan and a reusable instruction set.
- **Expected:** a plan covering gameplay flow, state machine, Socket.IO protocol,
  scoring, schedule, testing, deployment and Week 3 criteria.
- **Actual:** `Plan.md` (796 lines) plus `.github/copilot-instructions.md`, an
  instruction index and nine engineering modules. No application code.
- **Next decision:** review the plan for internal consistency before handing it
  to an implementation model.

## 002 — Plan and instruction audit (Claude Code, 2026-09-22)

- **Phase:** planning review.
- **Reason:** check whether the plan was specific enough for a weaker model to
  implement without inventing decisions.
- **Expected:** a list of gaps and contradictions.
- **Actual:** six contradictions found and fixed (phase enum; out-of-scope
  `answer:review` / `round:play-again`; NFKC vs NFC; a lifecycle that looped back
  to countdown; dictionary language vs letter-only validity; `requestId` vs
  strict schemas). Four new instruction modules written: 10 build order,
  11 exact stack, 12 schemas and error registry, 13 test recipes. `AGENTS.md`
  and `CLAUDE.md` added, because `.github/instructions/` is a Copilot-only
  convention and was not being loaded by the agent actually in use.
- **Next decision:** implement from module 10, one step at a time.

## 003 — Steps 0 and 1 (Claude Code, 2026-09-22)

- **Phase:** scaffold and required documents.
- **Reason:** establish a verifiable skeleton and write the Week 3 documents
  before gameplay code, as `Plan.md` §2A requires.
- **Expected:** install, typecheck, lint, test and build all pass; `/healthz`
  returns 200 from the built server; five documents exist with E1–E4 written as
  expectations only.
- **Actual:** verified in-session — `tsc --noEmit` clean; `eslint . --max-warnings=0`
  clean; `vitest run` 1 passed (scaffold placeholder); `vite build` + `tsup`
  produced `dist/client/index.html` and `dist/server/index.js`; `GET /healthz`
  → 200, `GET /` → 200, `GET /deep/spa/route` → 200 (SPA fallback).
  Documents written: `GAME_SPEC.md` (frozen), `BUILD_PROMPT_V1.md`,
  `CONTEXT_MANIFEST.md`, `EVALS.md` (E1–E3 pre-registered, E4 intentionally
  empty), this log.
- **Deviation recorded:** local Node is v26.8.1, above the v20/v22 named in
  module 11. All five scaffold checks pass on it. The deployment target must be
  pinned to Node 20 or 22 regardless.
- **Next decision:** Step 2 — contracts, with schema tests before any server code.

---

## Template for the next entry

```text
## NNN — <step> (<tool>, <date>)
- Phase:
- Reason:
- Expected:
- Actual (with the command output that proves it):
- Next decision:
```

---

## 004 — Step 2, contracts (Claude Code, 2026-09-22)

- **Phase:** implementation, boundary layer. No server or gameplay code yet.
- **Reason:** every later step parses its input with these schemas, so they come
  before any behavior that could be written against a guessed shape.
- **Expected:** `src/contracts` compiles, and every schema has a valid case, a
  malformed case, and an extra-key rejection case.
- **Actual:** three files written — `game.schemas.ts` (constants, primitives,
  `serverConfigSchema`), `errors.ts` (12-code closed registry, `Ack` envelope,
  `ok`/`fail`/`ackSchema`), `socket.schemas.ts` (requests, acks, server events,
  event-name constants). 65 tests pass; `npm run verify` green (typecheck, lint,
  vitest 65/65, client + server build).
- **Notable:** one test asserted that no client-facing error message looks like a
  stack trace. The first version of that regex was wrong — `at \w+` matched
  inside the word "That". The assertion was fixed; no product code changed.
- **Deviation recorded:** module 12 described two contract files; the error
  registry became a third, `errors.ts`. Module 12 was updated to match, and the
  create/join ack was corrected there to include the caller-private
  `resumeToken` it already promised in prose.
- **Next decision:** Step 3 — pure domain functions (normalize, validate, score)
  with the full scoring table from `GAME_SPEC.md` §5.

## 005 — Steps 3–7, the whole server (Claude Code, 2026-09-22)

- **Phase:** implementation, domain through socket layer. No client screens yet.
- **Reason:** finish every layer the browser cannot be trusted with, and prove
  it with tests that do not need a browser.
- **Expected:** pure domain functions matching the `Plan.md` §6 table; injected
  clock, scheduler and letter selection; a room store whose full phase machine
  and idempotent `closeRound` are testable without Socket.IO; handlers that only
  translate events into store calls; E1, E2 and E3 passing over real sockets.
- **Actual (verified in-session):** `npm run verify` green — `tsc --noEmit`
  clean, `eslint . --max-warnings=0` clean, **203 tests passed across 12 files**,
  `vite build` + `tsup` both succeeded. `npm run test:coverage` reported 100% on
  `src/domain` and `src/contracts` and 99.65% statements on `room-store.ts`,
  against thresholds of 80/70. The built server was started for real:
  `GET /healthz` → 200 `{"status":"ok"}`, an unknown client route → 200 via the
  SPA fallback.
- **Three decisions worth recording:**
  1. `Plan.md` §7 lists "at most 40 characters" as validity condition 1 but the
     verbatim `isValidAnswer` body it supplies does not check length.
     `GAME_SPEC.md` §5 (higher priority) treats the cap as an input bound and
     validity as non-empty + starts with the letter. The cap therefore stays
     owned by `answerValueSchema` at the boundary, and the domain function is
     used exactly as written. One rule, one owner.
  2. The store emits addressed *deliveries* (`socketId` + event + payload)
     through an injected sink rather than touching Socket.IO. A deadline close
     has no request in flight, so it needs a push path, and this keeps the whole
     state machine testable without a transport.
  3. Outbound payloads are parsed through the strict contract schemas before
     delivery, so an internal field added by accident throws at the projection
     instead of leaking to a browser.
- **Two test failures that were real, and what they taught:**
  - `loadConfig` echoed the rejected value in its error message, because Zod's
    enum text quotes it. A mis-assigned environment variable could hold a
    credential, so the message now names the variable only. Product code was
    fixed; the assertion was not weakened.
  - The deadline race could not be reproduced with `advance`, which fires the
    timer first and honestly yields `ROUND_STALE`. Moving the clock with
    `setNow` — wall time past `endsAt`, callback not yet run — is the only way
    to reach the `TOO_LATE` branch, and that is now how both the unit and the
    E3 test express it.
- **Known limitation:** no client screens yet, so no end-to-end human round has
  been played. E1–E3 pass headlessly; the two-browser evidence is Step 9 work.
- **Next decision:** Step 8 — the seven screens, rendering only parsed server
  projections, with the accessibility floor from module 10 treated as
  acceptance criteria.

## 006 — Step 8, the client (Claude Code, 2026-09-22)

- **Phase:** implementation, browser layer.
- **Reason:** make the verified server playable, with screens that render only
  parsed server projections.
- **Expected:** seven screens driven by one reducer; debounced drafts; a locked
  form on an accepted finish; no opponent answer in client state before reveal;
  the module 10 accessibility floor met as acceptance criteria.
- **Actual (verified in-session):** `npm run verify` green — typecheck clean,
  `eslint . --max-warnings=0` clean, **216 tests passed across 13 files**, both
  builds succeeded. The built server was run for real on a spare port: `GET /`
  returned the built `index.html` referencing the hashed bundle, and the
  Socket.IO handshake at `/socket.io/?EIO=4&transport=polling` returned 200 from
  the same process.
- **Thirteen new reducer tests** cover the client rules that are easy to get
  wrong: a late acknowledgement for an older revision must not mark a newer edit
  as saved; the form locks on the accepted finish ack, not the click; and no
  opponent answer exists anywhere in state before the reveal payload arrives.
- **Deviation recorded:** the results screen shows the honor-system notice in
  Serbian, with the exact English sentence from `Plan.md` §7 beneath it, because
  the rest of the interface is Serbian and the plan fixes that wording.
- **Known limitations, stated plainly:**
  1. There are **no DOM or component tests**. Adding a test renderer would mean
     new dependencies, which module 11 forbids without asking. The reducer and
     the socket adapter are tested; the rendered markup is not.
  2. Step 8's exit criterion — two browser profiles completing a full local
     round — has **not** been performed. It needs a human at two browsers, and
     the evidence belongs in Step 9.
  3. Contrast ratios in `app.css` were chosen from documented token values, not
     measured with a tool in this session.
- **Next decision:** Step 9 — run the pre-written evals unchanged against this
  commit, play a two-browser round, and record the real output, screenshots and
  commit hash in `docs/EVIDENCE_003.md`. Do not fix anything before the baseline
  is captured.

---

## 007 — Week 4 takeover: Spec Kit, single-player, AI check and hints (Claude Code, 2026-09-30)

- **Phase:** clarify → spec → plan → tasks → implementation of features 001 and 002.
- **Reason:** owner asked to keep the design, drop accounts and multiplayer (Vercel cannot host
  them), make the game single-player with AI-checked answers, examples and hint credits, and
  follow the Week 4 reliability materials and Spec Kit.
- **Expected:** constitution, two specs, plans, contracts, tasks; a green `npm run verify`
  with the full fake-provider matrix; no live call before the owner adds a key.
- **Actual:** Spec Kit installed (`specify` 1.0.14 via uv). Owner answered three clarifications
  (26 letters; 3 credits, full points; descriptive hints) and later added examples for misses
  and lite-only models. `npm run verify`: 22 files, **363 tests passed**, build OK. Five design
  findings made during implementation are recorded in `docs/EVIDENCE_W04.md`. Live calls: 0.
- **Next decision:** owner puts `GEMINI_API_KEY` in `.env`; run L1-L3 within budget and record
  below; if L2 misses a threshold, report before changing model or prompt.

## Week 4 — provider calls

Live Gemini calls only (fake-provider tests are not listed). Budget: ≤ 20 in development,
≤ 5 in the demo. Record: date, commit, command, model, calls, outcome, latency, tokens.

| Date | Commit | Command | Model | Calls | Outcome | p95 latency | Tokens | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-30 | uncommitted | browser game (hint) | gemini-3.5-flash-lite | 1 | success | 927 ms | 628 | |
| 2026-09-30 | uncommitted | browser game (hint) | gemini-3.5-flash-lite | 1 | invalid_output:semantic (leak) | 1068 ms | — | credit not spent |
| 2026-09-30 | uncommitted | browser game (round L) | gemini-3.5-flash-lite | 1 | success | 1628 ms | 1287 | |
| 2026-09-30 | uncommitted | browser game (round N) | gemini-3.5-flash-lite | 1 | success, 2 examples dropped | 2051 ms | 1550 | led to check-round.v2 |

| 2026-09-30 | uncommitted | browser game (hint K/Reka) | gemini-3.5-flash-lite | 2 | timeout ×2 (5.0 s, 3.9 s), fallback never reached | 9.0 s | — | credit not spent |
| 2026-09-30 | uncommitted | browser game (hint) | gemini-3.5-flash-lite | 2 | timeout ×2 | 9.0 s | — | credit not spent |
| 2026-09-30 | uncommitted | browser game (round) | gemini-3.5-flash-lite | 2 | timeout ×2 (8.0 s, 8.0 s) | 16.3 s | — | scored locally, "nije provereno" |
| 2026-09-30 | uncommitted | diagnostic: "reply ok", 30 s timeout | gemini-3.5-flash-lite | 1 | success but **13 652 ms**, 0 thought tokens | 13.7 s | — | Google-side slowness of this model |
| 2026-09-30 | uncommitted | diagnostic: "reply ok", 30 s timeout | gemini-3.1-flash-lite | 1 | success | 1.9 s | — | fallback model healthy |

Finding: retrying a timed-out model spent the whole deadline, so the healthy fallback never ran.
Changed: a timeout now moves straight to the next model (research R5, `classify.ts`).

| 2026-09-30 | uncommitted | `smoke:live -- capability gemini-3.6-flash` (default thinking) | gemini-3.6-flash | 1 | timeout (6 s) | 6.0 s | — | |
| 2026-09-30 | uncommitted | diagnostic "ok", 30 s | gemini-3.6-flash | 1 | success, 75 thought tokens | 3.1 s | — | thinks by default |
| 2026-09-30 | uncommitted | diagnostic "ok", 30 s | gemini-3.5-flash | 1 | success, 67 thought tokens | 16.8 s | — | 3.5 family slow tonight |
| 2026-09-30 | uncommitted | diagnostic "ok", `thinkingLevel: minimal` | gemini-3.6-flash | 1 | success, 0 thought tokens | 0.96 s | — | minimal accepted |
| 2026-09-30 | uncommitted | `smoke:live -- capability gemini-3.6-flash` (minimal) | gemini-3.6-flash | 1 | **pass**, 8/8 verdicts | 2.5 s | 1345 | added to chain |
| 2026-09-30 | uncommitted | `smoke:live -- capability gemini-3.5-flash` (minimal) | gemini-3.5-flash | 1 | timeout (6 s) | 6.0 s | — | held back from chain |

Running total: **18 / 20**. The remaining budget is reserved; L2/L3 need a new budget decision
from the owner. (only calls whose telemetry the owner shared; any other calls from the
same session are not counted here).
