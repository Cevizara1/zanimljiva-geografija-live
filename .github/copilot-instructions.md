# Copilot instructions — Zanimljiva Geografija

This repository is governed by Spec Kit. Read these before your first edit:

1. `.specify/memory/constitution.md` — the non-negotiable principles (I-VIII).
2. `docs/GAME_SPEC.md` — the rulebook: letters, categories, answer acceptance, hints.
3. `specs/001-singleplayer-vercel/`, `specs/002-ai-answer-check-and-hints/` and `specs/003-hint-tool-call/` — spec,
   plan, research, contracts, tasks and quickstart for the current features.

Week 3's two-player rules (`Plan.md`, `.github/instructions/*`) are archived in
`docs/archive/w03/` and no longer apply.

## The rules that matter most

1. The Gemini key lives only in the server environment. The browser talks only to our
   `/api/*`, never to the provider, and never receives the key, model chain or prompts.
2. AI output is untrusted: empty check → JSON parse → zod schema → semantic rules. The
   starting-letter rule, answer matching and points are code, not the model's call.
3. Every provider call is bounded: per-attempt timeout, one shared deadline, ≤ 2 attempts per
   model, jittered backoff, sequential fallback only for temporary errors, model rotation that
   skips cooling and out-of-quota models (`src/server/ai/model-health.ts`).
4. The game always works without AI: failures score locally, labelled "nije provereno".
5. Tests use fake providers; invalid input makes zero AI calls. Live calls are opt-in
   (`npm run smoke:live`) and budgeted.
6. Code reachable from `api/` imports with relative paths (Vercel ignores path aliases).
7. No new dependency, service, database or feature unless an approved spec lists it.

## Honesty rules

- Never say a command passed unless you ran it in this session and saw the output.
- Never make tests pass by skipping, deleting, or weakening them.
- If the same failure survives three attempts, stop and report goal, expected, actual,
  what you checked, and a precise question.
- Do not push, deploy, or open a pull request unless explicitly asked.

Gate before any handoff: `npm run verify`.
