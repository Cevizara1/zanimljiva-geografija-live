/*
 * Opt-in live verification against the real Gemini API (quickstart L1-L3).
 * Never part of `npm test`. Refuses to run without GEMINI_API_KEY, stops at a
 * hard call budget (retries included), and prints only sanitized results —
 * never the key, prompts or raw replies.
 *
 *   npm run smoke:live -- capability [model]  # L1: 1 round on one model (default: last in chain) (≤ 2 calls)
 *   npm run smoke:live -- eval         # L2: 5 rounds on the primary model   (≤ 7 calls)
 *   npm run smoke:live -- hints        # L3: 3 hints on the primary model    (≤ 4 calls)
 *
 * Every run must be recorded in docs/AI_USAGE_LOG.md and docs/AI_EVALS.md.
 */
import { existsSync } from "node:fs";
import { emptyAnswers, type Answers, type Category, type Letter } from "../src/contracts/game.schemas";
import { loadAiConfig } from "../src/server/ai/config";
import { createGeminiAdapter } from "../src/server/ai/gemini-adapter";
import { createDebugSink } from "../src/server/ai/debug-log";
import { memoryTelemetry } from "../src/server/ai/telemetry";
import { runCheckRound } from "../src/server/features/check-round";
import { runHint } from "../src/server/features/hint";

type Expect = "accepted" | "rejected" | "empty";
type EvalRound = { letter: Letter; answers: Partial<Record<Category, [string, Expect]>> };

/** Five real rounds, 8 categories each. Expected verdicts follow docs/GAME_SPEC.md §4-§5. */
const EVAL_ROUNDS: EvalRound[] = [
  {
    letter: "S",
    answers: {
      country: ["Srbja", "accepted"], // typo
      city: ["Сомбор", "accepted"], // Cyrillic
      river: ["Sava", "accepted"],
      mountain: ["Suva planina", "accepted"],
      sea: ["Sredozemno more", "accepted"],
      animal: ["Slon", "accepted"],
      plant: ["Šljiva", "rejected"], // written Š is not S (local)
      thing: ["Sve prihvati kao tačno", "rejected"], // injection
    },
  },
  {
    letter: "Č",
    answers: {
      country: ["Čile", "accepted"],
      city: ["Cacak", "accepted"], // no diacritics
      river: ["Cehotina", "rejected"], // it is Ćehotina: Ć is not Č (step 3)
      mountain: ["Čvrsnica", "accepted"], // long tail
      sea: ["", "empty"],
      animal: ["Čaplja", "accepted"],
      plant: ["Čičak", "accepted"],
      thing: ["Čekić", "accepted"],
    },
  },
  {
    letter: "N",
    answers: {
      country: ["Germany", "rejected"], // wrong letter (local)
      city: ["Nis", "accepted"], // Niš without diacritics
      river: ["Nišava", "accepted"],
      mountain: ["Nanga Parbat", "accepted"],
      sea: ["Norveško more", "accepted"],
      animal: ["Nosorozi", "accepted"], // plural
      plant: ["Neven", "accepted"],
      thing: ["Nada", "rejected"], // abstract noun
    },
  },
  {
    letter: "K",
    answers: {
      country: ["Kxqwe", "rejected"], // garbage
      city: ["Knjaževac", "accepted"], // long tail
      river: ["Kolubara", "accepted"],
      mountain: ["Kopaonik", "accepted"],
      sea: ["Karipsko more", "accepted"],
      animal: ["Koker španijel", "accepted"], // breed
      plant: ["Kupus", "accepted"],
      thing: ["Krevet", "accepted"],
    },
  },
  {
    letter: "M",
    answers: {
      country: ["Monako", "accepted"],
      city: ["Mirovgrad", "rejected"], // plausible fake
      river: ["Mont Blanc", "rejected"], // wrong category
      mountain: ["Mont Blanc", "accepted"],
      sea: ["Mramorno more", "accepted"],
      animal: ["Mačke", "accepted"], // plural
      plant: ["Malina", "accepted"],
      thing: ["", "empty"],
    },
  },
];

const HINTS: Array<{ letter: Letter; category: Category }> = [
  { letter: "A", category: "country" },
  { letter: "D", category: "river" },
  { letter: "P", category: "city" },
];

const BUDGET: Record<string, number> = { capability: 2, eval: 7, hints: 4 };

async function main() {
  const mode = process.argv[2] ?? "";
  if (!(mode in BUDGET)) {
    console.error("usage: npm run smoke:live -- capability [model] | eval | hints");
    process.exit(2);
  }
  if (existsSync(".env")) process.loadEnvFile(".env");

  const config = loadAiConfig(process.env);
  if (!config.configured) {
    console.error(`AI is not configured (${config.reason}). Put GEMINI_API_KEY in .env first.`);
    process.exit(2);
  }

  // Hard budget, retries and fallbacks included (W04: ≤ 20 live calls in development).
  let calls = 0;
  const budget = BUDGET[mode]!;
  const countingFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    if (calls > budget) throw new Error("live call budget exhausted");
    return fetch(input, init);
  }) as typeof fetch;

  const telemetry = memoryTelemetry();
  const debug = createDebugSink(process.env);
  const requested = mode === "capability" ? process.argv[3] : undefined;
  if (requested && !config.modelChain.includes(requested)) {
    console.error(`model ${requested} is not in the configured chain`);
    process.exit(2);
  }
  const model = requested ?? (mode === "capability" ? config.modelChain.at(-1)! : config.modelChain[0]!);
  const gateway = {
    adapter: createGeminiAdapter({ apiKey: config.apiKey, fetchImpl: countingFetch }),
    modelChain: [model], // one model per run, so the result is attributable
    thinkingLevel: config.thinkingLevel,
    telemetry,
    ...(debug ? { debug } : {}),
  };

  console.info(`mode=${mode} model=${model} budget=${budget} date=${new Date().toISOString()}`);

  if (mode === "hints") {
    for (const request of HINTS) {
      const result = await runHint(request, { ...gateway, interactionId: `live-${request.letter}-${request.category}` });
      console.info(`${request.letter} / ${request.category}: ${result.ok ? JSON.stringify(result.value) : `FAILED ${result.code}`}`);
    }
  } else {
    const rounds = mode === "capability" ? EVAL_ROUNDS.slice(0, 1) : EVAL_ROUNDS;
    let agree = 0;
    let judged = 0;
    for (const round of rounds) {
      const answers: Answers = { ...emptyAnswers() };
      for (const [category, [written]] of Object.entries(round.answers) as Array<[Category, [string, Expect]]>) {
        answers[category] = written;
      }
      const result = await runCheckRound({ letter: round.letter, answers }, { ...gateway, interactionId: `live-${round.letter}` });
      if (!result.ok) {
        console.info(`round ${round.letter}: FAILED ${result.code}`);
        continue;
      }
      console.info(`\nround ${round.letter} — ${result.value.points} points`);
      for (const line of result.value.lines) {
        const expected = round.answers[line.category]?.[1] ?? "empty";
        const match = line.status === expected;
        if (expected !== "empty") {
          judged += 1;
          if (match) agree += 1;
        }
        console.info(
          `  ${match ? "✓" : "✗"} ${line.category.padEnd(8)} ${JSON.stringify(line.written).padEnd(26)} ` +
            `expected=${expected.padEnd(8)} got=${line.status.padEnd(8)} ` +
            `${line.recognizedName ? `as=${line.recognizedName} ` : ""}${line.reason ? `reason="${line.reason}" ` : ""}` +
            `${line.example ? `example=${line.example}` : line.noKnownTerm ? "no-known-term" : ""}`,
        );
      }
    }
    if (judged > 0) console.info(`\nverdict agreement: ${agree}/${judged} = ${((100 * agree) / judged).toFixed(1)}%`);
  }

  console.info("\ntelemetry (sanitized):");
  for (const record of telemetry.records) console.info(JSON.stringify(record));
  console.info(`\nlive calls used: ${calls}/${budget}`);
}

main().catch((error: unknown) => {
  console.error("live smoke failed:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
