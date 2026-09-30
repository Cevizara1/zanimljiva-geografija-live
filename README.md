# Zanimljiva Geografija

A single-player browser version of the Serbian pen-and-paper game. Press **Nova igra**
and play five rounds: each round reveals a letter, and you have 150 seconds to write one term
per category — Država, Grad, Reka, Planina, More, Životinja, Biljka, Predmet. When the round
ends, an AI model checks that your terms really exist, and shows an example for every category
you missed. You get three hint credits per game for when you are stuck.

No accounts, no sign-in, no opponents. Built with TypeScript end to end: a React + Vite client
and stateless Node.js functions under `/api`, ready for Vercel.

## Run it locally

Requirements: Node.js 22 or newer, npm.

```bash
cp .env.example .env         # then put your key on the GEMINI_API_KEY= line
npm install
npm run dev                  # http://localhost:5173 — the game and its /api in one process
```

The only value you must set is `GEMINI_API_KEY`: a free key from
<https://aistudio.google.com/apikey>. Create it in a Google project **without billing
enabled**, so an exhausted free quota can never cost money. Without a key the game still
works — rounds are scored by the starting letter only and marked *nije provereno*, and hints
are shown as unavailable.

## Deploy to Vercel

1. Import the repository into Vercel. `vercel.json` sets the build command, the output
   directory (`dist/client`) and the function time limit; no other setting is needed.
2. In Project → Settings → Environment Variables, add `GEMINI_API_KEY`.
3. Deploy. `GET /api/health` answers `{"status":"ok","ai":"configured"}` when the key is set.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with the `/api` functions (no Vercel CLI needed) |
| `npm test` | All tests, offline — the AI provider is always a fake |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run build` / `npm run preview` | Production client build, and a local preview of it |
| `npm run verify` | typecheck + lint + test + build — the gate before any handoff |
| `npm run smoke:live -- capability\|eval\|hints` | Opt-in, budgeted calls to the real Gemini API |

**Seeing what the model answers.** Put `AI_DEBUG_LOG=1` in `.env` and restart `npm run dev`:
every AI attempt then prints to that terminal what was sent (letter and answers) and the
model's raw reply. Never the key; never in the browser; ignored on Vercel. Remove the line
when you are done. Without it, the terminal shows one privacy-safe `ai.interaction` line per
request (attempts, model, latency, tokens, validation counts).

## How the AI part works

```text
Browser ── POST /api/check-round ──▶ Vercel function ──▶ Gemini (generateContent)
        ◀── verdicts + examples ───   validate → rate limit → one bounded AI request
                                      → parse → schema → semantic rules → safe response
```

- One AI request per round (check + examples), plus one per spent hint — at most 8 per game.
- Models: `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-3.6-flash` (live-checked),
  then `gemini-3.7-flash` → `gemini-3.8-flash` → `gemini-3.5-flash` (not live-checked; reached
  only when the first three fail). Only one model is called per attempt. A model that
  times out, errors or runs out of its daily quota is skipped by the next requests (quota: until
  the daily reset, ~9h in Serbia). When every model is out of quota the game says so. Per-attempt
  timeout, one shared deadline, at most two attempts per model, never two models at once.
- The starting-letter rule and the points are decided by code; the AI only says whether a
  term exists and belongs to its category.
- Details: [AI provider contract](specs/002-ai-answer-check-and-hints/contracts/ai-provider-contract.md),
  [HTTP API](specs/002-ai-answer-check-and-hints/contracts/http-api.md),
  [tool contract](docs/TOOL_CONTRACT.md) (hints are one gated `show_hint` tool call),
  [evidence](docs/EVIDENCE_W04.md), [evidence 004](docs/EVIDENCE_004.md).

## Documentation

| File | What it holds |
| --- | --- |
| [docs/GAME_SPEC.md](docs/GAME_SPEC.md) | The rulebook: letters, categories, what is accepted, hints |
| [.specify/memory/constitution.md](.specify/memory/constitution.md) | Engineering principles |
| [specs/001-singleplayer-vercel](specs/001-singleplayer-vercel/) | Single-player game on Vercel: spec, plan, tasks |
| [specs/002-ai-answer-check-and-hints](specs/002-ai-answer-check-and-hints/) | AI check and hints: spec, plan, contracts, tasks |
| [specs/003-hint-tool-call](specs/003-hint-tool-call/) | Hint as one gated tool call (Session 004) |
| [docs/README.md](docs/README.md) | Where each Week 4 artifact lives |
| [docs/archive/w03/](docs/archive/w03/) | The Week 3 two-player version's plan and rules |

## Known limitations

- A game lives in the open tab: refreshing it ends the game.
- Hint credits are counted in the browser; the server limits request rates to protect the
  quota but cannot enforce credits without storage.
- AI verdicts can differ between calls for the same answer; the letter rule never does.
- The free Gemini tier may use requests to improve Google's products. Only the letter, the
  category names and your answers (≤ 40 characters each) are sent.
