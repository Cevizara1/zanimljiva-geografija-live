import { MIN_ANSWER_LENGTH, type Letter } from "../contracts/game.schemas.js";
import { matchesWritten } from "./letter-match.js";
import { normalizeAnswer } from "./normalize-answer.js";

export type LocalVerdict =
  | { ok: true }
  | { ok: false; reason: "empty" | "too_short" | "wrong_letter" };

/**
 * GAME_SPEC §5 step 1 — decided before, and without, any AI call: at least
 * MIN_ANSWER_LENGTH letters after normalization, and the right starting letter
 * under §5.2. The 40-character cap is owned by `answerValueSchema` at the boundary.
 */
export function checkAnswerLocally(raw: string, letter: Letter): LocalVerdict {
  const normalized = normalizeAnswer(raw);
  if (normalized === "") return { ok: false, reason: "empty" };
  if (normalized.length < MIN_ANSWER_LENGTH) return { ok: false, reason: "too_short" };
  if (!matchesWritten(raw, letter)) return { ok: false, reason: "wrong_letter" };
  return { ok: true };
}

/** Boolean form of the local rule; the letter may be given in any case. */
export function isValidAnswer(raw: string, letter: string): boolean {
  const upper = letter.toLocaleUpperCase("sr-Latn") as Letter;
  return checkAnswerLocally(raw, upper).ok;
}
