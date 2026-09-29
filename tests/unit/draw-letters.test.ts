import { describe, expect, it } from "vitest";
import { LETTERS, ROUNDS_PER_GAME } from "@contracts/game.schemas";
import { drawLetters } from "@domain/draw-letters";

/** Deterministic integer source for tests (mulberry32). */
function seeded(seed: number) {
  let state = seed >>> 0;
  return (maxExclusive: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    return Math.floor(unit * maxExclusive);
  };
}

describe("drawLetters", () => {
  it("draws five letters from the 26-letter set", () => {
    const letters = drawLetters(seeded(1));
    expect(letters).toHaveLength(ROUNDS_PER_GAME);
    for (const letter of letters) expect(LETTERS).toContain(letter);
  });

  it("never repeats a letter within a game, and reaches every letter (SC-004)", () => {
    const seen = new Set<string>();
    const random = seeded(42);
    for (let game = 0; game < 1000; game++) {
      const letters = drawLetters(random);
      expect(new Set(letters).size).toBe(letters.length);
      for (const letter of letters) seen.add(letter);
    }
    expect(seen.size).toBe(LETTERS.length);
  });

  it("rejects a random source that returns out-of-range values", () => {
    expect(() => drawLetters(() => 26)).toThrow();
    expect(() => drawLetters(() => -1)).toThrow();
  });
});
