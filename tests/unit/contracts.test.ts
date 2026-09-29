import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  CATEGORY_LABELS_SR,
  LETTERS,
  answerValueSchema,
  answersSchema,
  categoryResultSchema,
  categorySchema,
  emptyAnswers,
  letterSchema,
} from "@contracts/game.schemas";

describe("game schemas", () => {
  it("accepts the eight categories and rejects anything else", () => {
    expect(CATEGORIES).toHaveLength(8);
    for (const category of CATEGORIES) expect(categorySchema.parse(category)).toBe(category);
    expect(categorySchema.safeParse("capital").success).toBe(false);
    // Removed on 2026-09-23; it must not parse from an old payload.
    expect(categorySchema.safeParse("lake").success).toBe(false);
  });

  it("accepts the 26 round letters (GAME_SPEC §3) and nothing else", () => {
    expect(LETTERS).toHaveLength(26);
    for (const letter of LETTERS) expect(letterSchema.parse(letter)).toBe(letter);
    for (const other of ["Dž", "Đ", "Lj", "Nj", "Q", "W", "X", "Y", "s", ""]) {
      expect(letterSchema.safeParse(other).success).toBe(false);
    }
  });

  it("has a Serbian label for every category", () => {
    for (const category of CATEGORIES) expect(CATEGORY_LABELS_SR[category].length).toBeGreaterThan(0);
  });

  it("bounds an answer at 40 characters", () => {
    expect(answerValueSchema.safeParse("S".repeat(40)).success).toBe(true);
    expect(answerValueSchema.safeParse("S".repeat(41)).success).toBe(false);
  });

  it("requires all eight answers and rejects unknown keys", () => {
    expect(answersSchema.safeParse(emptyAnswers()).success).toBe(true);
    const { sea: _sea, ...missing } = emptyAnswers();
    expect(answersSchema.safeParse(missing).success).toBe(false);
    expect(answersSchema.safeParse({ ...emptyAnswers(), lake: "" }).success).toBe(false);
  });

  it("allows only 0 or 10 points on a result line", () => {
    const line = {
      category: "river",
      written: "Sava",
      status: "accepted",
      recognizedName: "Sava",
      reason: null,
      example: null,
      noKnownTerm: false,
      points: 10,
    };
    expect(categoryResultSchema.safeParse(line).success).toBe(true);
    expect(categoryResultSchema.safeParse({ ...line, points: 5 }).success).toBe(false);
  });
});
