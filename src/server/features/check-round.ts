import {
  checkRoundOutputSchema,
  CHECK_ROUND_JSON_SCHEMA,
  type CheckItem,
  type ReasonCode,
} from "../../contracts/ai-output.schemas";
import type { CheckRoundRequest, CheckRoundSuccess } from "../../contracts/api.schemas";
import {
  CATEGORIES,
  CATEGORY_NOUN_SR,
  MAX_ANSWER_LENGTH,
  POINTS_ACCEPTED,
  type Answers,
  type Category,
  type CategoryResult,
  type Letter,
} from "../../contracts/game.schemas";
import { compactFold } from "../../domain/fold-letters";
import { matchesRecognised } from "../../domain/letter-match";
import { editDistance, resembles } from "../../domain/resemblance";
import { localReasonText, sumPoints } from "../../domain/score-round";
import { checkAnswerLocally } from "../../domain/validate-answer";
import { generate, type GatewayDeps } from "../ai/gateway";
import { BUDGETS } from "../ai/retry-policy";
import type { AiResult, Validation, ValidationNotes } from "../ai/types";
import {
  buildCheckRoundContent,
  CHECK_ROUND_PROMPT_VERSION,
  CHECK_ROUND_SYSTEM_INSTRUCTION,
  type CheckRoundItem,
} from "../prompts/check-round.v2";

/*
 * One request per round (FR-002): judge what passed the local rule, and ask
 * for an example wherever the player missed or left the field empty.
 */

const REASON_TEXT: Record<Exclude<ReasonCode, "pogresna_kategorija">, string> = {
  ne_postoji: "ne postoji",
  istorijski: "ne postoji danas",
  nije_prepoznato: "nije prepoznato",
};

function reasonText(code: ReasonCode | "", category: Category): string {
  if (code === "pogresna_kategorija") return `nije ${CATEGORY_NOUN_SR[category]}`;
  return REASON_TEXT[code === "" ? "nije_prepoznato" : code];
}

const blank = (value: string): string | null => (value.trim() === "" ? null : value.trim());

/** What we sent: an answer to judge, or null when only an example is wanted. */
export function planItems(request: CheckRoundRequest): CheckRoundItem[] {
  return CATEGORIES.map((category) => {
    const written = request.answers[category];
    return { category, answer: checkAnswerLocally(written, request.letter).ok ? written : null };
  });
}

/**
 * The name the letter rule is checked on: the recognised name (Serbian or
 * English) closest to what the player wrote, Serbian on a tie (research R7-3).
 */
function nameToCheck(written: string, item: CheckItem): string | null {
  const candidates = [blank(item.recognizedSr), blank(item.recognizedEn)].filter(
    (name): name is string => name !== null && resembles(written, name),
  );
  if (candidates.length === 0) return null;
  const target = compactFold(written);
  return candidates.reduce((best, name) =>
    editDistance(target, compactFold(name)) < editDistance(target, compactFold(best)) ? name : best,
  );
}

/** Parse → schema → semantic validation (research R7). Pure; exported for tests. */
export function validateCheckRound(
  text: string,
  letter: Letter,
  answers: Answers,
  sent: readonly CheckRoundItem[],
): Validation<CheckRoundSuccess> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid_output:json" };
  }

  const parsed = checkRoundOutputSchema.safeParse(json);
  if (!parsed.success) return { ok: false, code: "invalid_output:schema" };

  // Rule 1: exactly the categories we sent, each once.
  const byCategory = new Map<Category, CheckItem>();
  for (const item of parsed.data.items) {
    if (byCategory.has(item.category)) return { ok: false, code: "invalid_output:semantic" };
    byCategory.set(item.category, item);
  }
  if (byCategory.size !== sent.length || sent.some(({ category }) => !byCategory.has(category))) {
    return { ok: false, code: "invalid_output:semantic" };
  }

  // Rule 2: a verdict for each judged answer, none for example-only items.
  for (const { category, answer } of sent) {
    const verdict = byCategory.get(category)!.verdict;
    if ((answer === null) !== (verdict === "not_judged")) return { ok: false, code: "invalid_output:semantic" };
  }

  const notes: ValidationNotes = {
    itemsJudged: 0,
    itemsExampleOnly: 0,
    overrides: 0,
    examplesDropped: 0,
    droppedWrongLetter: 0,
    droppedTooLong: 0,
    droppedSameAsAnswer: 0,
    contradictionsResolved: 0,
  };

  const lines = sent.map(({ category, answer }): CategoryResult => {
    const item = byCategory.get(category)!;
    const written = answers[category];
    let status: CategoryResult["status"];
    let reason: string | null = null;
    let recognizedName: string | null = null;

    if (answer === null) {
      notes.itemsExampleOnly! += 1;
      const local = checkAnswerLocally(written, letter);
      status = !local.ok && local.reason === "empty" ? "empty" : "rejected";
      reason = localReasonText(local, letter);
    } else {
      notes.itemsJudged! += 1;
      if (item.verdict === "accepted") {
        const name = nameToCheck(written, item);
        if (name === null) {
          // Rule 4: the model named something the player did not write.
          status = "rejected";
          reason = "nije prepoznato";
          notes.overrides! += 1;
        } else if (!matchesRecognised(name, letter)) {
          // Rule 3: the letter rule is code, not the model's call.
          status = "rejected";
          reason = `ne počinje slovom ${letter}`;
          notes.overrides! += 1;
        } else {
          status = "accepted";
          recognizedName = name;
        }
      } else {
        status = "rejected";
        reason = reasonText(item.reason, category);
      }
    }

    // Rule 6: the model gives an example for every item; show it only on lines that did not
    // score (including ones overridden above), and only if it obeys the letter rule. An example
    // that passes our checks wins over a contradictory "noKnownTerm" (live finding 2026-09-30:
    // the lite model read the flag as "the player's answer is unknown").
    let example: string | null = null;
    let noKnownTerm = false;
    if (status !== "accepted") {
      const candidate = blank(item.example);
      if (candidate === null) {
        noKnownTerm = item.noKnownTerm;
      } else {
        const dropped =
          candidate.length > MAX_ANSWER_LENGTH
            ? "droppedTooLong"
            : !matchesRecognised(candidate, letter)
              ? "droppedWrongLetter"
              : compactFold(candidate) === compactFold(written)
                ? "droppedSameAsAnswer"
                : null;
        if (dropped === null) {
          example = candidate;
          if (item.noKnownTerm) notes.contradictionsResolved! += 1;
        } else {
          notes.examplesDropped! += 1;
          notes[dropped]! += 1;
        }
      }
    }

    return {
      category,
      written,
      status,
      recognizedName,
      reason,
      example,
      noKnownTerm,
      points: status === "accepted" ? POINTS_ACCEPTED : 0,
    };
  });

  return { ok: true, value: { ok: true, verified: true, points: sumPoints(lines), lines }, notes };
}

export async function runCheckRound(
  request: CheckRoundRequest,
  deps: GatewayDeps & { interactionId: string },
  signal?: AbortSignal,
): Promise<AiResult<CheckRoundSuccess>> {
  const sent = planItems(request);
  return generate(
    {
      operation: "check-round",
      promptVersion: CHECK_ROUND_PROMPT_VERSION,
      interactionId: deps.interactionId,
      systemInstruction: CHECK_ROUND_SYSTEM_INSTRUCTION,
      userContent: buildCheckRoundContent(request.letter, sent),
      responseJsonSchema: CHECK_ROUND_JSON_SCHEMA,
      temperature: 0,
      maxOutputTokens: 1_500,
      budget: BUDGETS["check-round"],
      validate: (text) => validateCheckRound(text, request.letter, request.answers, sent),
    },
    deps,
    signal,
  );
}
