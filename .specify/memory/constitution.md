<!--
Sync Impact Report (1.1.0, 2026-09-30)
- Version change: 1.0.0 -> 1.1.0 (MINOR: one bounded exception added to Principle VIII)
- Modified principles: VIII. Privacy-Safe Telemetry — adds the local debug-log exception
- Reason: the owner asked to see every model reply while developing; the free Gemini tier has no
  request logs in AI Studio (logs require the paid tier).
- Templates: no changes needed.

Sync Impact Report (1.0.0)
- Version change: (none, W03 rules lived in Plan.md + .github/) -> 1.0.0
- Principles added: I-VIII (all new; first Spec Kit constitution for this repository)
- Superseded: Plan.md §4-§13 and .github/instructions/* (Week 3 two-player Socket.IO rules:
  server-owned letter/timer/phase, room privacy, closeRound). They describe a system that
  features 001/002 remove, so they are archived, not amended.
- Added sections: Technology & Hosting Constraints, Development Workflow, Governance
- Removed sections: none (no prior constitution)
- Templates: plan/spec/tasks templates read this file at runtime; no template edits needed.
- Follow-up TODOs: archive Plan.md and .github/instructions/* into docs/archive/w03/ as part of
  feature 001 (tracked in specs/001-singleplayer-vercel/spec.md FR-016).
-->

# Zanimljiva Geografija Constitution

## Core Principles

### I. Secrets and Provider Calls Are Server-Only

- The browser talks only to this project's own `/api/*` endpoints. It never calls an AI
  provider directly and never receives a provider key, model chain, raw prompt, or raw response.
- `GEMINI_API_KEY` (and any other provider secret) is read from the server environment only.
  It MUST NOT appear in client code, the client bundle, source control, logs, error bodies,
  test fixtures, specs, evidence, or screenshots. A key that leaks is treated as compromised.
- The browser never chooses the provider or the model. The model chain is server configuration.

**Rationale**: the key is the only real asset this app holds; one boundary keeps it provable.

### II. The Model Suggests, the Application Decides

- AI output is untrusted external input. Every response passes, in order: non-empty check,
  JSON parse, strict schema validation, then semantic/business validation on the server.
- Deterministic server rules — the starting-letter rule, answer-to-verdict matching, points —
  are decided by code, not by the model. A model verdict that contradicts a deterministic rule
  is overridden by the rule.
- A response that fails any validation step is never shown or scored as a success.

**Rationale**: a model is a fallible classifier; the game's fairness must not depend on it.

### III. Bounded, Classified Reliability

- Every provider call has a per-attempt timeout and one total deadline shared by retries and
  fallbacks. Retries use exponential backoff with jitter and a finite attempt count.
- Only transient classes are retried or failed over (timeout, network, 429, 500, 502, 503).
  400, 401, 403, safety/policy refusal, and malformed output are never blindly retried and
  never trigger a model fallback.
- The fallback chain contains only allowlisted, tested models, tried sequentially — never in
  parallel. SDK-internal retries are disabled so every attempt is visible to our policy.
- When the chain is exhausted the caller receives a stable, safe failure type.

**Rationale**: Week 4 reliability rules; "retry is not fallback" and both share one deadline.

### IV. The Game Works Without AI

- If AI verification is unavailable, a round is still scored by the deterministic local rule
  and is clearly labelled as not AI-verified. Unverified results are never presented as verified.
- A failed hint never consumes a hint credit. No AI failure may block the player from
  continuing to the next round or finishing the game.
- Users see short, safe Serbian messages — never stack traces, provider errors, or internals.

**Rationale**: safe failure is part of the product, not a catch block.

### V. Fake First, Live Last

- Automated tests use an injected fake provider and never need a real key or network.
- Invalid local input MUST produce zero provider calls, and a test proves `providerCallCount === 0`.
- The test matrix covers at least: success, invalid local input, timeout, provider failure,
  malformed output (empty / bad JSON / schema-invalid / semantically wrong), bounded retry,
  fallback used, and no-fallback classes (401/403/400/refusal).
- Live provider calls are opt-in, manual, and budgeted (≤20 during development, ≤5 in the demo),
  and their results are recorded honestly.

**Rationale**: fake tests prove our logic; a live smoke proves only the integration.

### VI. Contracts at Every Boundary

- Every boundary shape (HTTP request/response bodies, AI output, configuration) is defined once
  as a shared runtime schema, and TypeScript types are inferred from it. Payloads are `unknown`
  until parsed; unparsed payloads are never cast.
- Normalization, transliteration, the letter rule, and scoring are pure deterministic functions
  with no network, clock, or framework dependency.

**Rationale**: a TypeScript type alone is not validation.

### VII. Stateless Simplicity

- The backend is a set of stateless TypeScript functions that run on Vercel. There is no
  database, no accounts, no login, no multiplayer, and no persistent server state. Any
  in-memory cache or rate limiter is best-effort and documented as such.
- No new dependency, service, event, or feature is added unless an approved spec lists it.
  Items marked Stretch are out of scope until a spec promotes them.
- Prefer the smallest change that fully solves the problem; flag any contract change.

**Rationale**: the hosting target and the Week 4 scope both reward the smallest system.

### VIII. Privacy-Safe Telemetry

- Each logical AI interaction records: operation, interaction id, ordered attempts (provider,
  model, attempt kind initial/retry/fallback, status, error class, latency), fallback used,
  final outcome, and token usage when the provider reports it.
- Telemetry never contains the key, raw prompts, raw responses, or full player answer sheets.
  Missing token usage stays unknown; it is never estimated from string length.
- **Exception — local debug log (1.1.0).** With `AI_DEBUG_LOG=1` in a local environment, each
  attempt's sent user content (letter and answers) and the model's raw reply MAY be printed to
  the developer's own server terminal. It MUST be off by default, MUST be forced off when
  `VERCEL` is set or `NODE_ENV` is `production`, MUST never print the key, headers or system
  prompt, MUST never be sent to the browser, and is not telemetry (nothing is stored).

**Rationale**: we must be able to explain every attempt without leaking anything.

## Technology & Hosting Constraints

- Language: TypeScript everywhere (client, serverless functions, shared contracts, tests).
- Client: React + Vite single-page app. The existing visual design — the paper game sheet,
  doodle borders, typography, and light/dark theme toggle — is preserved; screens may be
  simplified for single-player but not restyled.
- Backend: Node.js TypeScript functions deployed on Vercel under `/api/*`, runnable locally
  without a Vercel account.
- AI provider: Google Gemini (free-tier key). The model chain is configured by environment.
- Validation: zod. Tests: Vitest. Gate command: `npm run verify`
  (typecheck + lint + test + build) before any handoff.
- Setup promise: a developer copies `.env.example` to `.env`, fills in `GEMINI_API_KEY`,
  and runs `npm install && npm run dev`. On Vercel, the same single variable is set in the
  project settings.

## Development Workflow

- Every change goes through Spec Kit: specify → clarify → plan → tasks → implement → validate
  → evidence. Each feature lives in `specs/NNN-name/`. The AI feature has its own spec.
- Changes to API contracts, hint credits, or the AI provider policy are planned and approved
  before implementation.
- Honesty rules: never claim a command passed unless it ran in this session and its output was
  seen; never make tests pass by skipping, deleting, or weakening them; if the same failure
  survives three attempts, stop and report goal, expected, actual, what was checked, and a
  precise question.
- Never push, deploy, or open a pull request unless explicitly asked.
- When a decision is made or a regression is found or fixed, the relevant spec, plan, or
  evidence document is updated in the same pass.

## Governance

- This constitution supersedes `Plan.md` and `.github/instructions/*`, which describe the
  Week 3 two-player system and are kept only as archived history.
- Amendments are made by editing this file in a commit that states the change and bumps the
  version: MAJOR for removing or redefining a principle, MINOR for adding a principle or
  materially expanding guidance, PATCH for clarifications.
- Every plan's Constitution Check and every review verifies compliance with Principles I-VIII.
  Any justified deviation is recorded in that plan's Complexity Tracking table.

**Version**: 1.1.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-09-30
