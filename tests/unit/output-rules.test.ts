import { describe, expect, it } from "vitest";
import {
  CHECK_ROUND_JSON_SCHEMA,
  HINT_JSON_SCHEMA,
  checkItemSchema,
  checkRoundOutputSchema,
  hintOutputSchema,
} from "@contracts/ai-output.schemas";
import { leaksTerm } from "@domain/hint-leak";
import { editDistance, resembles } from "@domain/resemblance";

const item = {
  category: "city",
  verdict: "accepted",
  recognizedSr: "Čačak",
  recognizedEn: "Cacak",
  reason: "",
  example: "",
  noKnownTerm: false,
};

describe("model output schemas (T16)", () => {
  it("accept the contract example", () => {
    expect(checkRoundOutputSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(hintOutputSchema.safeParse({ term: "Dunav", termEn: "Danube", clue: "Reka kroz Beograd.", noKnownTerm: false }).success).toBe(true);
  });

  it.each([
    ["an extra field", { ...item, confidence: 0.9 }],
    ["a missing field", { ...item, noKnownTerm: undefined }],
    ["a wrong verdict", { ...item, verdict: "maybe" }],
    ["an unknown reason", { ...item, reason: "ne_znam" }],
    ["an unknown category", { ...item, category: "lake" }],
    ["a 61-character name", { ...item, recognizedSr: "Č".repeat(61) }],
    ["a control character", { ...item, example: "Dunav\u0007" }],
    ["null instead of an empty string", { ...item, example: null }],
  ])("reject %s", (_label, candidate) => {
    expect(checkItemSchema.safeParse(candidate).success).toBe(false);
  });

  it("reject more than eight items and unknown top-level keys", () => {
    expect(checkRoundOutputSchema.safeParse({ items: Array(9).fill(item) }).success).toBe(false);
    expect(checkRoundOutputSchema.safeParse({ items: [item], note: "x" }).success).toBe(false);
  });

  it("reject an over-long hint clue", () => {
    expect(hintOutputSchema.safeParse({ term: "Dunav", termEn: "", clue: "a".repeat(201), noKnownTerm: false }).success).toBe(false);
  });
});

describe("JSON Schema sent to Gemini matches the zod schema (parity)", () => {
  it("check-round: same fields, all required, same enums, no extras", () => {
    const schema = CHECK_ROUND_JSON_SCHEMA.properties.items.items;
    expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(checkItemSchema.shape).sort());
    expect([...schema.required].sort()).toEqual(Object.keys(checkItemSchema.shape).sort());
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.properties.verdict.enum]).toEqual([...checkItemSchema.shape.verdict.options]);
    expect([...schema.properties.reason.enum]).toEqual([...checkItemSchema.shape.reason.options]);
    expect([...schema.properties.category.enum]).toEqual([...checkItemSchema.shape.category.options]);
  });

  it("hint: same fields, all required", () => {
    expect(Object.keys(HINT_JSON_SCHEMA.properties).sort()).toEqual(Object.keys(hintOutputSchema.shape).sort());
    expect([...HINT_JSON_SCHEMA.required].sort()).toEqual(Object.keys(hintOutputSchema.shape).sort());
  });

  it("uses only the JSON Schema keywords Gemini documents", () => {
    const allowed = new Set(["type", "properties", "required", "additionalProperties", "enum", "items", "minItems", "maxItems", "description"]);
    const walk = (node: unknown): void => {
      // Arrays here are values (enum members, required names), not schemas.
      if (!node || typeof node !== "object" || Array.isArray(node)) return;
      for (const [key, value] of Object.entries(node)) {
        if (key !== "properties") expect(allowed.has(key), key).toBe(true);
        if (key === "properties") for (const child of Object.values(value as object)) walk(child);
        else if (typeof value === "object") walk(value);
      }
    };
    walk(CHECK_ROUND_JSON_SCHEMA);
    walk(HINT_JSON_SCHEMA);
  });
});

describe("resembles — the recognised name must look like the written answer (T19)", () => {
  it.each([
    ["Srbja", "Srbija", true],
    ["Cacak", "Čačak", true],
    ["Djevdjelija", "Đevđelija", true],
    ["Dzakarta", "Džakarta", true],
    ["Žirafe", "Žirafa", true],
    ["Jadran", "Jadransko more", true],
    ["Сомбор", "Sombor", true],
    ["  SAD ", "SAD", true],
    ["Kxqwe", "Kenija", false],
    ["Ke", "Kenija", false],
    ["Beogradija", "Bogota", false],
    ["Kragujevo", "Kragujevac", true], // close spelling: resemblance passes; the strict prompt must reject fakes
    ["", "Srbija", false],
  ])("%j ~ %j → %s", (written, name, expected) => {
    expect(resembles(written, name)).toBe(expected);
  });

  it("computes edit distance", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("leaksTerm — a hint must not give the word away (H02)", () => {
  it.each([
    ["Druga najduža reka Evrope; protiče kroz Beograd. Drugo slovo: U.", ["Dunav", "Danube"], false],
    ["Glavni grad Francuske, poznat po Ajfelovoj kuli. Ima 5 slova.", ["Pariz", "Paris"], false],
    ["Ljudi iz ove zemlje prvi su sleteli na Mesec.", ["Amerika", "America"], false],
    ["Reka Dunav teče kroz Beograd.", ["Dunav", "Danube"], true],
    ["Река Дунав тече кроз Београд.", ["Dunav", "Danube"], true],
    ["Poznata je kao Danube na engleskom.", ["Dunav", "Danube"], true],
    ["Reka čije ime počinje sa Duna…", ["Dunav", "Danube"], true],
    ["Najveći grad Paris regiona.", ["Pariz", "Paris"], true],
    ["Zemlja poznata kao SAD.", ["SAD", "USA"], true],
    ["Zemlja sa pedeset saveznih država.", ["SAD", "USA"], false],
  ])("%j → %s", (clue, terms, expected) => {
    expect(leaksTerm(clue, terms)).toBe(expected);
  });
});
