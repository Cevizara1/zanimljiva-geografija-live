import { z } from "zod";
import {
  CATEGORY_COUNT,
  POINTS_ACCEPTED,
  answersSchema,
  categoryResultSchema,
  categorySchema,
  letterSchema,
} from "./game.schemas.js";

/*
 * The browser ↔ backend contract (specs/002-ai-answer-check-and-hints/contracts/http-api.md).
 * Both sides parse with these schemas: the server its requests, the browser its
 * responses. Unknown keys are rejected everywhere.
 */

export const MAX_BODY_BYTES = 4_096;
export const MIN_CLUE_LENGTH = 10;
export const MAX_CLUE_LENGTH = 200;

/* ----------------------------------------------------------------- failure */

export const apiFailureCodeSchema = z.enum([
  "INVALID_REQUEST",
  "METHOD_NOT_ALLOWED",
  "RATE_LIMITED",
  "AI_NOT_CONFIGURED",
  "AI_UNAVAILABLE",
  "AI_QUOTA_EXHAUSTED",
]);
export type ApiFailureCode = z.infer<typeof apiFailureCodeSchema>;

export const apiFailureSchema = z
  .object({
    ok: z.literal(false),
    code: apiFailureCodeSchema,
    retryable: z.boolean(),
    message: z.string().max(200),
  })
  .strict();
export type ApiFailure = z.infer<typeof apiFailureSchema>;

/* ------------------------------------------------------------- check-round */

export const checkRoundRequestSchema = z
  .object({ letter: letterSchema, answers: answersSchema })
  .strict();
export type CheckRoundRequest = z.infer<typeof checkRoundRequestSchema>;

export const checkRoundSuccessSchema = z
  .object({
    ok: z.literal(true),
    verified: z.literal(true),
    points: z.number().int().min(0).max(CATEGORY_COUNT * POINTS_ACCEPTED),
    lines: z.array(categoryResultSchema).length(CATEGORY_COUNT),
  })
  .strict();
export type CheckRoundSuccess = z.infer<typeof checkRoundSuccessSchema>;

export const checkRoundResponseSchema = z.union([checkRoundSuccessSchema, apiFailureSchema]);
export type CheckRoundResponse = z.infer<typeof checkRoundResponseSchema>;

/* -------------------------------------------------------------------- hint */

export const hintRequestSchema = z.object({ letter: letterSchema, category: categorySchema }).strict();
export type HintRequest = z.infer<typeof hintRequestSchema>;

export const hintSuccessSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ok: z.literal(true),
      kind: z.literal("clue"),
      category: categorySchema,
      clue: z.string().min(MIN_CLUE_LENGTH).max(MAX_CLUE_LENGTH),
    })
    .strict(),
  z
    .object({ ok: z.literal(true), kind: z.literal("no_known_term"), category: categorySchema })
    .strict(),
]);
export type HintSuccess = z.infer<typeof hintSuccessSchema>;

export const hintResponseSchema = z.union([hintSuccessSchema, apiFailureSchema]);
export type HintResponse = z.infer<typeof hintResponseSchema>;

/* ------------------------------------------------------------------ health */

export const healthResponseSchema = z
  .object({ status: z.literal("ok"), ai: z.enum(["configured", "not_configured"]) })
  .strict();
export type HealthResponse = z.infer<typeof healthResponseSchema>;
