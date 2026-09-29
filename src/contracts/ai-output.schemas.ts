import { z } from "zod";
import { CATEGORIES, categorySchema } from "./game.schemas";

/*
 * What the model must return (contracts/ai-provider-contract.md). Two fences:
 * the JSON Schema below is sent to Gemini as `responseJsonSchema`; the zod
 * schemas re-validate the reply here, including limits Gemini cannot express.
 *
 * Gemini documents only a subset of JSON Schema (type, properties, required,
 * additionalProperties, enum, items, min/maxItems, description), with no
 * `anyOf` or nullable types, so "no value" is the empty string "" and our
 * validation turns it into null.
 */

export const MAX_NAME_LENGTH = 60;
export const MAX_RAW_CLUE_LENGTH = 200;

const noControlCharacters = (value: string) => !/\p{Cc}/u.test(value);

const name = z.string().max(MAX_NAME_LENGTH).refine(noControlCharacters, "control character");

export const VERDICTS = ["accepted", "rejected", "not_judged"] as const;
export const REASON_CODES = ["ne_postoji", "pogresna_kategorija", "istorijski", "nije_prepoznato"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const checkItemSchema = z
  .object({
    category: categorySchema,
    verdict: z.enum(VERDICTS),
    recognizedSr: name,
    recognizedEn: name,
    reason: z.enum([...REASON_CODES, ""]),
    example: name,
    noKnownTerm: z.boolean(),
  })
  .strict();
export type CheckItem = z.infer<typeof checkItemSchema>;

export const checkRoundOutputSchema = z
  .object({ items: z.array(checkItemSchema).min(1).max(CATEGORIES.length) })
  .strict();
export type CheckRoundOutput = z.infer<typeof checkRoundOutputSchema>;

export const hintOutputSchema = z
  .object({
    term: name,
    termEn: name,
    clue: z.string().max(MAX_RAW_CLUE_LENGTH).refine(noControlCharacters, "control character"),
    noKnownTerm: z.boolean(),
  })
  .strict();
export type HintOutput = z.infer<typeof hintOutputSchema>;

/* ------------------------------------------------ JSON Schemas for Gemini */

const str = (description: string) => ({ type: "string", description });

export const CHECK_ROUND_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      minItems: 1,
      maxItems: CATEGORIES.length,
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...CATEGORIES] },
          verdict: { type: "string", enum: [...VERDICTS] },
          recognizedSr: str('Correct Serbian Latin spelling of the recognised term, or "".'),
          recognizedEn: str('English name of the recognised term, or "".'),
          reason: { type: "string", enum: [...REASON_CODES, ""] },
          example: str('Best-known real term of the category on the round letter, or "".'),
          noKnownTerm: {
            type: "boolean",
            description: "True only when NO real term of this category starts with the round letter. Not about the player's answer.",
          },
        },
        required: ["category", "verdict", "recognizedSr", "recognizedEn", "reason", "example", "noKnownTerm"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

export const HINT_JSON_SCHEMA = {
  type: "object",
  properties: {
    term: str('The term in Serbian Latin, or "".'),
    termEn: str('The English name, or "".'),
    clue: str('One or two short Serbian sentences that describe the term without naming it, or "".'),
    noKnownTerm: { type: "boolean" },
  },
  required: ["term", "termEn", "clue", "noKnownTerm"],
  additionalProperties: false,
} as const;
