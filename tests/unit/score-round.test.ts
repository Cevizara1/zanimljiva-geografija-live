import { describe, expect, it } from "vitest";
import { CATEGORIES, emptyAnswers, type Answers } from "@contracts/game.schemas";
import { scoreRoundLocally } from "@domain/score-round";

describe("scoreRoundLocally — the no-AI rule (GAME_SPEC §5 step 1, §6)", () => {
  it("scores 10 for each answer that passes the local check and 0 otherwise", () => {
    const answers = { ...emptyAnswers(), country: "Srbija", city: "Sombor", river: "Beograd", sea: "S" };
    const result = scoreRoundLocally(answers, "S");

    const byCategory = Object.fromEntries(result.lines.map((line) => [line.category, line]));
    expect(byCategory.country).toMatchObject({ status: "accepted", points: 10, reason: null });
    expect(byCategory.city).toMatchObject({ status: "accepted", points: 10 });
    expect(byCategory.river).toMatchObject({ status: "rejected", points: 0, reason: "ne počinje slovom S" });
    expect(byCategory.sea).toMatchObject({ status: "rejected", points: 0, reason: "prekratko" });
    expect(byCategory.plant).toMatchObject({ status: "empty", points: 0, reason: null });
    expect(result.points).toBe(20);
  });

  it("is never verified, and never invents a recognised name or an example", () => {
    const result = scoreRoundLocally({ ...emptyAnswers(), country: "Srbija" }, "S");
    expect(result.verified).toBe(false);
    for (const line of result.lines) {
      expect(line.recognizedName).toBeNull();
      expect(line.example).toBeNull();
      expect(line.noKnownTerm).toBe(false);
    }
  });

  it("returns the eight lines in sheet order, at most 80 points", () => {
    const full = Object.fromEntries(CATEGORIES.map((category) => [category, "Sava"])) as Answers;
    const result = scoreRoundLocally(full, "S");
    expect(result.lines.map((line) => line.category)).toEqual([...CATEGORIES]);
    expect(result.points).toBe(80);
  });

  it("keeps the text exactly as written", () => {
    const result = scoreRoundLocally({ ...emptyAnswers(), country: "  Србија " }, "S");
    expect(result.lines[0]).toMatchObject({ written: "  Србија ", status: "accepted" });
  });

  it("rejects a written diacritic for the plain letter even without the AI", () => {
    const result = scoreRoundLocally({ ...emptyAnswers(), city: "Šabac" }, "S");
    expect(result.lines[1]).toMatchObject({ status: "rejected", reason: "ne počinje slovom S" });
  });
});
