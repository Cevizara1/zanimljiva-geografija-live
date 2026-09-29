# Quickstart: validate feature 001

## Prerequisites

Node.js ≥ 22, npm. No account, database or Vercel CLI.

## Run locally

```bash
cp .env.example .env      # GEMINI_API_KEY may stay empty for 001
npm install
npm run dev               # http://localhost:5173 — SPA + /api via the dev middleware
```

## Automated checks

```bash
npm test                  # domain + reducer + api handler tests, fully offline
npm run verify            # typecheck + lint + test + build — must pass before handoff
```

Expected: all green; `draw-letters` simulation reports 0 repeated letters in 1,000 games and
all 26 letters seen; every GAME_SPEC §5.2 row passes in `letter-match.test.ts`.

## Manual scenarios

| # | Do | Expect |
| --- | --- | --- |
| M1 | Open the app, press **Nova igra** | countdown, then a letter; no name/room/sign-in asked (SC-001/002) |
| M2 | Type answers, press **Završio sam** | round locks and is scored; **Sledeća runda** appears |
| M3 | In round 2 wait until time runs out, with focus in a field | round ends at 0:00; typed text is scored |
| M4 | In round 3 switch tabs for 3 minutes, come back | round has ended; not extended (SC-005) |
| M5 | Finish round 5 | five lines + total = sum of rounds; **Nova igra** starts a fresh sheet |
| M6 | Toggle light/dark on each screen | styling matches current build (SC-006; screenshots) |
| M7 | `curl http://localhost:5173/api/health` | `{"status":"ok"}` |

## Deploy (performed by the owner)

1. Import the repository into Vercel (framework preset: Vite; `vercel.json` sets build and
   output). 2. Set `GEMINI_API_KEY` in Project → Settings → Environment Variables.
3. Deploy; repeat M1, M5 and M7 on the deployed URL.
