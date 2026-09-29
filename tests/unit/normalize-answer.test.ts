import { describe, expect, it } from "vitest";
import { normalizeAnswer } from "@domain/normalize-answer";

describe("normalizeAnswer", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeAnswer(" Srbija ")).toBe("srbija");
    expect(normalizeAnswer("SRBIJA")).toBe("srbija");
  });

  it("makes casing and padding variants compare equal", () => {
    expect(normalizeAnswer(" Srbija ")).toBe(normalizeAnswer("SRBIJA"));
  });

  it("collapses repeated internal whitespace of every kind to a single space", () => {
    expect(normalizeAnswer("Bosna   i\tHercegovina")).toBe("bosna i hercegovina");
    expect(normalizeAnswer("Novi\n\nSad")).toBe("novi sad");
  });

  it("applies NFKC so compatibility forms fold to their canonical characters", () => {
    expect(normalizeAnswer("Ｓｒｂｉｊａ")).toBe("srbija");
    // Decomposed S + combining caron composes to Š, then lowercases.
    expect(normalizeAnswer("Šabac")).toBe(normalizeAnswer("Šabac"));
  });

  it("preserves Serbian Latin diacritics instead of stripping them", () => {
    expect(normalizeAnswer("Šabac")).toBe("šabac");
    expect(normalizeAnswer("Đerdap")).toBe("đerdap");
    expect(normalizeAnswer("Čačak")).toBe("čačak");
    // Consequence worth stating: a diacritic is not equal to its plain letter.
    expect(normalizeAnswer("Šabac")).not.toBe(normalizeAnswer("Sabac"));
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeAnswer("")).toBe("");
    expect(normalizeAnswer("   ")).toBe("");
    expect(normalizeAnswer("\t\n ")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeAnswer("  Novi   SAD ");
    expect(normalizeAnswer(once)).toBe(once);
  });
});

describe("normalizeAnswer — Cyrillic and Latin are one script (GAME_SPEC §5.1)", () => {
  it("transliterates Serbian Cyrillic to Latin", () => {
    expect(normalizeAnswer("Сомбор")).toBe("sombor");
    expect(normalizeAnswer("Београд")).toBe("beograd");
    expect(normalizeAnswer("Чачак")).toBe("čačak");
    expect(normalizeAnswer("Шабац")).toBe("šabac");
    expect(normalizeAnswer("Жирафа")).toBe("žirafa");
    expect(normalizeAnswer("Ћуприја")).toBe("ćuprija");
    expect(normalizeAnswer("Ђевђелија")).toBe("đevđelija");
  });

  it("turns the single Cyrillic digraph letters into two Latin letters", () => {
    expect(normalizeAnswer("Љубљана")).toBe("ljubljana");
    expect(normalizeAnswer("Његош")).toBe("njegoš");
    expect(normalizeAnswer("Џакарта")).toBe("džakarta");
  });

  it("makes the Cyrillic and Latin spellings compare equal", () => {
    expect(normalizeAnswer("  СРБИЈА ")).toBe(normalizeAnswer("Srbija"));
  });

  it("handles mixed script inside one answer", () => {
    expect(normalizeAnswer("Novi Сад")).toBe("novi sad");
  });

  it("folds the Latin ligature forms of dž, lj and nj", () => {
    expect(normalizeAnswer("ǅakarta")).toBe("džakarta");
    expect(normalizeAnswer("ǈubljana")).toBe("ljubljana");
  });
});
