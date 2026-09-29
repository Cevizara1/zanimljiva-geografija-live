/** Serbian Cyrillic (lower case) → Serbian Latin. Љ, Њ, Џ become two letters. */
const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z", и: "i",
  ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r",
  с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č", џ: "dž", ш: "š",
};

/**
 * The single normalization implementation for the whole system (GAME_SPEC §5.1):
 * NFKC (which also splits the ǅ/ǈ/ǋ ligatures), trim, collapse internal
 * whitespace, Serbian lower-casing, then Cyrillic → Latin. Diacritics are kept;
 * folding them is a separate, explicit step used only by the local letter check.
 */
export function normalizeAnswer(raw: string): string {
  const lower = raw
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("sr-Latn");

  let latin = "";
  for (const char of lower) latin += CYRILLIC_TO_LATIN[char] ?? char;
  return latin;
}
