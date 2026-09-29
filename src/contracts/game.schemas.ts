import { z } from "zod";

/*
 * Shared by the browser and the serverless functions. Everything reachable from
 * `api/` imports with relative paths: Vercel does not resolve tsconfig path
 * mappings (specs/001-singleplayer-vercel/research.md R2).
 */

/* ---------------------------------------------------------------- constants */

export const CATEGORIES = [
  "country",
  "city",
  "river",
  "mountain",
  "sea",
  "animal",
  "plant",
  "thing",
] as const;

export const CATEGORY_COUNT = CATEGORIES.length;

/**
 * GAME_SPEC §3: the Serbian alphabet without Dž, Đ, Lj and Nj (owner's choice,
 * 2026-09-30). Words starting with those still count for D, L and N (§5.2).
 */
export const LETTERS = [
  "A", "B", "C", "Č", "Ć", "D", "E", "F", "G", "H", "I", "J", "K",
  "L", "M", "N", "O", "P", "R", "S", "Š", "T", "U", "V", "Z", "Ž",
] as const;

export const ROUNDS_PER_GAME = 5;
export const COUNTDOWN_MS = 3_000;
export const ROUND_DURATION_MS = 150_000;
export const MAX_ANSWER_LENGTH = 40;
/**
 * Shortest answer that can score. A single letter is the round letter typed
 * back, not an answer. This is a validity rule, not an input bound.
 */
export const MIN_ANSWER_LENGTH = 2;
export const POINTS_ACCEPTED = 10;
export const HINT_CREDITS_PER_GAME = 3;

/* -------------------------------------------------------------- primitives */

export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const letterSchema = z.enum(LETTERS);
export type Letter = z.infer<typeof letterSchema>;

/** Serbian Latin labels. The UI never hard-codes these strings. */
export const CATEGORY_LABELS_SR: Record<Category, string> = {
  country: "Država",
  city: "Grad",
  river: "Reka",
  mountain: "Planina",
  sea: "More",
  animal: "Životinja",
  plant: "Biljka",
  thing: "Predmet",
};

/** For reasons such as "nije reka": the label in lower case, as it reads mid-sentence. */
export const CATEGORY_NOUN_SR: Record<Category, string> = {
  country: "država",
  city: "grad",
  river: "reka",
  mountain: "planina",
  sea: "more",
  animal: "životinja",
  plant: "biljka",
  thing: "predmet",
};

export const answerValueSchema = z.string().max(MAX_ANSWER_LENGTH);

/** The eight answers of one round, keyed by category; every key present. */
export const answersSchema = z
  .object({
    country: answerValueSchema,
    city: answerValueSchema,
    river: answerValueSchema,
    mountain: answerValueSchema,
    sea: answerValueSchema,
    animal: answerValueSchema,
    plant: answerValueSchema,
    thing: answerValueSchema,
  })
  .strict();
export type Answers = z.infer<typeof answersSchema>;

export function emptyAnswers(): Answers {
  return {
    country: "",
    city: "",
    river: "",
    mountain: "",
    sea: "",
    animal: "",
    plant: "",
    thing: "",
  };
}

/* --------------------------------------------------------------- results */

export const lineStatusSchema = z.enum(["accepted", "rejected", "empty"]);
export type LineStatus = z.infer<typeof lineStatusSchema>;

export const pointsSchema = z.union([z.literal(0), z.literal(POINTS_ACCEPTED)]);

/** One category of one scored round, as the results sheet shows it. */
export const categoryResultSchema = z
  .object({
    category: categorySchema,
    written: answerValueSchema,
    status: lineStatusSchema,
    /** Correct spelling the AI recognised; null when unverified or not recognised. */
    recognizedName: z.string().max(60).nullable(),
    /** Short Serbian reason for a rejection; null when accepted or empty. */
    reason: z.string().max(60).nullable(),
    /** A term the player could have written; only for rejected or empty lines. */
    example: z.string().max(60).nullable(),
    /** True when no real term exists for this letter and category. */
    noKnownTerm: z.boolean(),
    points: pointsSchema,
  })
  .strict();
export type CategoryResult = z.infer<typeof categoryResultSchema>;
