import type { Letter } from "../contracts/game.schemas.js";
import { normalizeAnswer } from "./normalize-answer.js";

/**
 * GAME_SPEC §5.2. Letters are compared as Serbian letters, so the digraphs
 * dž, lj and nj are read as one letter, and đ is its own letter.
 */
const DIGRAPHS = ["dž", "lj", "nj"] as const;

/** A letter the player can only have typed on purpose: it names one letter exactly. */
const MARKED = new Set(["č", "ć", "š", "ž"]);

/** The plain letter each Serbian letter falls back to when diacritics are left out. */
const BASE: Readonly<Record<string, string>> = {
  č: "c",
  ć: "c",
  š: "s",
  ž: "z",
  đ: "d",
  dž: "d",
  lj: "l",
  nj: "n",
};

/** Dž, Đ, Lj and Nj are not round letters, so words on them count for D, L and N. */
const COUNTS_FOR: Readonly<Record<string, readonly string[]>> = {
  d: ["đ", "dž"],
  l: ["lj"],
  n: ["nj"],
};

/** First Serbian letter of an already normalized string ("" when empty). */
function firstLetter(normalized: string): string {
  for (const digraph of DIGRAPHS) {
    if (normalized.startsWith(digraph)) return digraph;
  }
  const [first] = normalized;
  return first ?? "";
}

const base = (letter: string): string => BASE[letter] ?? letter;

/**
 * Local check on what the player wrote. Lenient only where the player left a
 * diacritic out: "Sabac" may be Šabac, so it passes for S and Š alike and the
 * recognised-name check decides. A written č/ć/š/ž is unambiguous.
 */
export function matchesWritten(written: string, letter: Letter): boolean {
  const typed = firstLetter(normalizeAnswer(written));
  if (typed === "") return false;

  const round = normalizeAnswer(letter);
  if (base(typed) !== base(round)) return false;
  return !MARKED.has(typed) || typed === round;
}

/**
 * Step 3 on the correctly spelled name the AI recognised: an exact letter
 * match, diacritics respected, so Čačak never counts for C.
 */
export function matchesRecognised(name: string, letter: Letter): boolean {
  const first = firstLetter(normalizeAnswer(name));
  if (first === "") return false;

  const round = normalizeAnswer(letter);
  if (first === round) return true;
  // "Ljubljana" starts with lj, which is written with an l but is a letter of its own.
  return COUNTS_FOR[round]?.includes(first) ?? false;
}
