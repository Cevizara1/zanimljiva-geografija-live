import { LETTERS, ROUNDS_PER_GAME, type Letter } from "../contracts/game.schemas.js";

/** Returns an integer in [0, maxExclusive). Injected so tests can pin the letters. */
export type RandomInt = (maxExclusive: number) => number;

/**
 * Five distinct letters for one game (GAME_SPEC §3): a partial Fisher-Yates
 * shuffle, so no letter can repeat within a game.
 */
export function drawLetters(randomInt: RandomInt, count: number = ROUNDS_PER_GAME): Letter[] {
  const pool: Letter[] = [...LETTERS];
  for (let index = 0; index < count; index++) {
    const span = pool.length - index;
    const offset = randomInt(span);
    if (!Number.isInteger(offset) || offset < 0 || offset >= span) {
      throw new RangeError("random source returned a value out of range");
    }
    const pick = index + offset;
    [pool[index], pool[pick]] = [pool[pick]!, pool[index]!];
  }
  return pool.slice(0, count);
}
