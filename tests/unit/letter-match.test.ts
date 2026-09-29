import { describe, expect, it } from "vitest";
import { LETTERS, type Letter } from "@contracts/game.schemas";
import { matchesRecognised, matchesWritten } from "@domain/letter-match";

/** GAME_SPEC §5.2, "written answer may start with (local check)". */
const WRITTEN: Array<[Letter, string, boolean]> = [
  ["C", "Cetinje", true],
  ["C", "Cacak", true], // no diacritic: ambiguous, step 3 decides
  ["C", "Čačak", false],
  ["C", "Ćuprija", false],
  ["Č", "Cacak", true],
  ["Č", "Čačak", true],
  ["Č", "Ćuprija", false],
  ["Ć", "Cuprija", true],
  ["Ć", "Ćuprija", true],
  ["Ć", "Čačak", false],
  ["S", "Srbija", true],
  ["S", "Sabac", true],
  ["S", "Šabac", false],
  ["Š", "Sabac", true],
  ["Š", "Šabac", true],
  ["Z", "Zagreb", true],
  ["Z", "Žirafa", false],
  ["Ž", "Zirafa", true],
  ["Ž", "Žirafa", true],
  ["D", "Dunav", true],
  ["D", "Djevdjelija", true],
  ["D", "Đevđelija", true],
  ["D", "Dzakarta", true],
  ["D", "Džakarta", true],
  ["D", "Џакарта", true],
  ["L", "London", true],
  ["L", "Ljubljana", true],
  ["L", "Љубљана", true],
  ["N", "Niš", true],
  ["N", "Njemačka", true],
  ["N", "Germany", false],
  ["V", "Wien", false],
  ["B", "Београд", true],
  ["A", "  amerika ", true],
  ["K", "", false],
];

/** GAME_SPEC §5.2, "recognised name must start with (step 3)". */
const RECOGNISED: Array<[Letter, string, boolean]> = [
  ["C", "Cetinje", true],
  ["C", "Čačak", false],
  ["C", "Ćuprija", false],
  ["C", "Chad", true],
  ["Č", "Čačak", true],
  ["Č", "Cetinje", false],
  ["Ć", "Ćuprija", true],
  ["Ć", "Čačak", false],
  ["S", "Šabac", false],
  ["Š", "Šabac", true],
  ["Š", "Sombor", false],
  ["Z", "Žirafa", false],
  ["Ž", "Žirafa", true],
  ["D", "Dunav", true],
  ["D", "Đevđelija", true],
  ["D", "Džakarta", true],
  ["L", "Ljubljana", true],
  ["N", "Njemačka", true],
  ["N", "Nemačka", true],
  ["G", "Germany", true],
  ["J", "Jakarta", true],
  ["A", "", false],
];

describe("matchesWritten — local check on what the player typed", () => {
  it.each(WRITTEN)("letter %s, written %j → %s", (letter, written, expected) => {
    expect(matchesWritten(written, letter)).toBe(expected);
  });
});

describe("matchesRecognised — step 3 on the name the AI recognised", () => {
  it.each(RECOGNISED)("letter %s, recognised %j → %s", (letter, name, expected) => {
    expect(matchesRecognised(name, letter)).toBe(expected);
  });

  it("accepts a name the model wrote in Cyrillic", () => {
    expect(matchesRecognised("Чачак", "Č")).toBe(true);
  });

  it("matches every round letter against a word that starts with it", () => {
    for (const letter of LETTERS) {
      expect(matchesWritten(`${letter}xyz`, letter)).toBe(true);
      expect(matchesRecognised(`${letter}xyz`, letter)).toBe(true);
    }
  });
});
