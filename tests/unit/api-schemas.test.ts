import { describe, expect, it } from "vitest";
import { CATEGORIES, emptyAnswers, type CategoryResult } from "@contracts/game.schemas";
import {
  apiFailureSchema,
  checkRoundRequestSchema,
  checkRoundResponseSchema,
  healthResponseSchema,
  hintRequestSchema,
  hintResponseSchema,
} from "@contracts/api.schemas";

const line = (category: CategoryResult["category"]): CategoryResult => ({
  category,
  written: "Dunav",
  status: "accepted",
  recognizedName: "Dunav",
  reason: null,
  example: null,
  noKnownTerm: false,
  points: 10,
});

describe("CheckRoundRequest (contracts/http-api.md)", () => {
  const valid = { letter: "D", answers: { ...emptyAnswers(), river: "Dunav" } };

  it("accepts a letter from the 26 and all eight answers", () => {
    expect(checkRoundRequestSchema.safeParse(valid).success).toBe(true);
    expect(checkRoundRequestSchema.safeParse({ ...valid, letter: "Č" }).success).toBe(true);
  });

  it.each([
    ["an unsupported letter", { ...valid, letter: "Q" }],
    ["a digraph letter", { ...valid, letter: "Lj" }],
    ["a lower-case letter", { ...valid, letter: "d" }],
    ["a missing category", { ...valid, answers: { river: "Dunav" } }],
    ["an unknown category", { ...valid, answers: { ...valid.answers, lake: "Dojran" } }],
    ["a 41-character answer", { ...valid, answers: { ...valid.answers, city: "D".repeat(41) } }],
    ["a non-string answer", { ...valid, answers: { ...valid.answers, city: 7 } }],
    ["an extra top-level key", { ...valid, model: "gemini-3.8-flash" }],
  ])("rejects %s", (_label, body) => {
    expect(checkRoundRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("CheckRoundResponse", () => {
  const lines = CATEGORIES.map(line);

  it("accepts a verified success with eight lines", () => {
    const body = { ok: true, verified: true, points: 80, lines };
    expect(checkRoundResponseSchema.safeParse(body).success).toBe(true);
  });

  it("rejects a success with a missing line or an unknown field", () => {
    expect(checkRoundResponseSchema.safeParse({ ok: true, verified: true, points: 70, lines: lines.slice(1) }).success).toBe(false);
    expect(checkRoundResponseSchema.safeParse({ ok: true, verified: true, points: 80, lines, model: "x" }).success).toBe(false);
  });

  it("accepts each documented failure and nothing else", () => {
    for (const code of ["INVALID_REQUEST", "METHOD_NOT_ALLOWED", "RATE_LIMITED", "AI_NOT_CONFIGURED", "AI_UNAVAILABLE"]) {
      expect(apiFailureSchema.safeParse({ ok: false, code, retryable: false, message: "x" }).success).toBe(true);
    }
    expect(apiFailureSchema.safeParse({ ok: false, code: "BOOM", retryable: false, message: "x" }).success).toBe(false);
    expect(apiFailureSchema.safeParse({ ok: false, code: "AI_UNAVAILABLE", retryable: true, message: "x", stack: "…" }).success).toBe(false);
  });
});

describe("Hint request and response", () => {
  it("accepts a letter and a category only", () => {
    expect(hintRequestSchema.safeParse({ letter: "A", category: "country" }).success).toBe(true);
    expect(hintRequestSchema.safeParse({ letter: "A", category: "country", credits: 99 }).success).toBe(false);
    expect(hintRequestSchema.safeParse({ letter: "A", category: "lake" }).success).toBe(false);
  });

  it("accepts a clue or no-known-term, never the term itself", () => {
    const clue = { ok: true, kind: "clue", category: "country", clue: "Ljudi iz ove zemlje prvi su sleteli na Mesec." };
    expect(hintResponseSchema.safeParse(clue).success).toBe(true);
    expect(hintResponseSchema.safeParse({ ok: true, kind: "no_known_term", category: "sea" }).success).toBe(true);
    expect(hintResponseSchema.safeParse({ ...clue, term: "Amerika" }).success).toBe(false);
    expect(hintResponseSchema.safeParse({ ...clue, clue: "kratko" }).success).toBe(false);
  });
});

describe("Health", () => {
  it("reports only whether AI is configured", () => {
    expect(healthResponseSchema.safeParse({ status: "ok", ai: "configured" }).success).toBe(true);
    expect(healthResponseSchema.safeParse({ status: "ok", ai: "configured", chain: ["x"] }).success).toBe(false);
  });
});
