import {
  CATEGORIES,
  POINTS_ACCEPTED,
  type Answers,
  type CategoryResult,
  type Letter,
} from "../contracts/game.schemas";
import { checkAnswerLocally, type LocalVerdict } from "./validate-answer";

export type RoundResult = {
  lines: CategoryResult[];
  points: number;
  /** True only when the AI check succeeded (feature 002). */
  verified: boolean;
};

/** Short Serbian reason for a local rejection, as the results sheet shows it. */
export function localReasonText(verdict: LocalVerdict, letter: Letter): string | null {
  if (verdict.ok || verdict.reason === "empty") return null;
  return verdict.reason === "too_short" ? "prekratko" : `ne počinje slovom ${letter}`;
}

export function sumPoints(lines: readonly CategoryResult[]): number {
  return lines.reduce((total, line) => total + line.points, 0);
}

/**
 * The no-AI scoring rule (GAME_SPEC §6): 10 for every answer that passes the
 * local check, 0 otherwise. Used when feature 002's check is unavailable, and
 * therefore always marked unverified.
 */
export function scoreRoundLocally(answers: Answers, letter: Letter): RoundResult {
  const lines = CATEGORIES.map((category): CategoryResult => {
    const written = answers[category];
    const verdict = checkAnswerLocally(written, letter);
    return {
      category,
      written,
      status: verdict.ok ? "accepted" : verdict.reason === "empty" ? "empty" : "rejected",
      recognizedName: null,
      reason: localReasonText(verdict, letter),
      example: null,
      noKnownTerm: false,
      points: verdict.ok ? POINTS_ACCEPTED : 0,
    };
  });

  return { lines, points: sumPoints(lines), verified: false };
}
