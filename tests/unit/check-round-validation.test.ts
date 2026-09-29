import { describe, expect, it } from "vitest";
import { CATEGORIES, emptyAnswers, type Answers, type Letter } from "@contracts/game.schemas";
import { planItems, validateCheckRound } from "@server/features/check-round";

type Item = {
  category: string;
  verdict: string;
  recognizedSr: string;
  recognizedEn: string;
  reason: string;
  example: string;
  noKnownTerm: boolean;
};

const notJudged = (category: string, example: string): Item => ({
  category,
  verdict: "not_judged",
  recognizedSr: "",
  recognizedEn: "",
  reason: "",
  example,
  noKnownTerm: false,
});

function setup(letter: Letter, answers: Partial<Answers>) {
  const full = { ...emptyAnswers(), ...answers };
  const sent = planItems({ letter, answers: full });
  const reply = (items: Record<string, Partial<Item>>) =>
    JSON.stringify({
      items: sent.map(({ category }) => ({ ...notJudged(category, `${letter}primer`), ...items[category] })),
    });
  return { full, sent, reply, validate: (text: string) => validateCheckRound(text, letter, full, sent) };
}

describe("validateCheckRound — structure (research R7 rules 1-2)", () => {
  it("rejects a reply that drops, duplicates or adds a category (T17)", () => {
    const { validate, sent } = setup("S", {});
    const items = sent.map(({ category }) => notJudged(category, "Sava"));
    expect(validate(JSON.stringify({ items: items.slice(1) }))).toMatchObject({ ok: false, code: "invalid_output:semantic" });
    expect(validate(JSON.stringify({ items: [...items.slice(1), items[1]] }))).toMatchObject({ ok: false, code: "invalid_output:semantic" });
  });

  it("rejects a verdict on an item that was sent for an example only", () => {
    const { validate } = setup("S", {});
    const text = setup("S", {}).sent.map(({ category }) => ({ ...notJudged(category, "Sava"), verdict: category === "city" ? "accepted" : "not_judged" }));
    expect(validate(JSON.stringify({ items: text }))).toMatchObject({ ok: false, code: "invalid_output:semantic" });
  });

  it("rejects a missing verdict on an answer that was sent to be judged", () => {
    const { validate, reply } = setup("S", { country: "Srbija" });
    expect(validate(reply({}))).toMatchObject({ ok: false, code: "invalid_output:semantic" });
  });

  it("maps JSON and schema failures to their own codes (T15, T16)", () => {
    const { validate } = setup("S", {});
    expect(validate("")).toMatchObject({ code: "invalid_output:json" });
    expect(validate("{")).toMatchObject({ code: "invalid_output:json" });
    expect(validate('{"items":[{"category":"city"}]}')).toMatchObject({ code: "invalid_output:schema" });
  });
});

describe("validateCheckRound — the application overrides the model", () => {
  it("T18: an accepted answer whose name starts with another letter is rejected", () => {
    const { validate, reply } = setup("C", { city: "Cacak" });
    const result = validate(reply({ city: { verdict: "accepted", recognizedSr: "Čačak", recognizedEn: "Cacak", example: "Cetinje" } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines[1]).toMatchObject({ status: "rejected", reason: "ne počinje slovom C", example: "Cetinje", points: 0 });
    expect(result.notes).toMatchObject({ overrides: 1 });
  });

  it("T19: an accepted answer the model turned into a different term is rejected", () => {
    const { validate, reply } = setup("K", { country: "Kxqwe" });
    const result = validate(reply({ country: { verdict: "accepted", recognizedSr: "Kenija", recognizedEn: "Kenya", example: "Kanada" } }));
    expect(result.ok && result.value.lines[0]).toMatchObject({ status: "rejected", reason: "nije prepoznato" });
  });

  it("an accepted answer with no recognised name is rejected", () => {
    const { validate, reply } = setup("S", { country: "Srbija" });
    const result = validate(reply({ country: { verdict: "accepted", recognizedSr: "", recognizedEn: "" } }));
    expect(result.ok && result.value.lines[0]).toMatchObject({ status: "rejected", reason: "nije prepoznato" });
  });

  it("a rejection without a reason reads 'nije prepoznato'", () => {
    const { validate, reply } = setup("S", { country: "Srbija" });
    const result = validate(reply({ country: { verdict: "rejected", reason: "" } }));
    expect(result.ok && result.value.lines[0]).toMatchObject({ status: "rejected", reason: "nije prepoznato" });
  });
});

describe("validateCheckRound — examples (research R7 rule 6)", () => {
  it("T20: an example on the wrong letter is dropped, and only that example", () => {
    const { validate, reply } = setup("S", { country: "Srbija" });
    const result = validate(
      reply({
        country: { verdict: "accepted", recognizedSr: "Srbija", recognizedEn: "Serbia", example: "Slovenija" },
        city: { example: "Beograd" },
        river: { example: "Šabac" },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [country, city, river, mountain] = result.value.lines;
    expect(country).toMatchObject({ status: "accepted", example: null, points: 10 });
    expect(city).toMatchObject({ status: "empty", example: null });
    expect(river).toMatchObject({ status: "empty", example: null });
    expect(mountain).toMatchObject({ status: "empty", example: "Sprimer" });
    expect(result.notes).toMatchObject({ examplesDropped: 2 });
  });

  it("does not offer the player's own rejected answer back as the example", () => {
    const { validate, reply } = setup("M", { river: "Mont Blanc" });
    const result = validate(reply({ river: { verdict: "rejected", reason: "pogresna_kategorija", example: "mont blanc" } }));
    expect(result.ok && result.value.lines[2]).toMatchObject({ reason: "nije reka", example: null });
  });

  it("says 'no known term' when the model says so and gives no example", () => {
    const { validate, reply } = setup("Ć", {});
    const result = validate(reply({ sea: { noKnownTerm: true, example: "" } }));
    expect(result.ok && result.value.lines[4]).toMatchObject({ noKnownTerm: true, example: null });
  });

  it("shows a valid example even when the model also set noKnownTerm (live finding, 2026-09-30)", () => {
    // The v1 rule dropped both; live round N lost two good examples that way.
    const { validate, reply } = setup("N", { mountain: "nikaragva", sea: "novo" });
    const result = validate(
      reply({
        mountain: { verdict: "rejected", reason: "pogresna_kategorija", example: "Nanga Parbat", noKnownTerm: true },
        sea: { verdict: "rejected", reason: "ne_postoji", example: "Norveško more", noKnownTerm: true },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines[3]).toMatchObject({ reason: "nije planina", example: "Nanga Parbat", noKnownTerm: false });
    expect(result.value.lines[4]).toMatchObject({ reason: "ne postoji", example: "Norveško more", noKnownTerm: false });
    expect(result.notes).toMatchObject({ contradictionsResolved: 2, examplesDropped: 0 });
  });

  it("records why an example was dropped, as counts only", () => {
    const { validate, reply } = setup("S", { country: "Sxy" });
    const result = validate(
      reply({
        country: { verdict: "rejected", reason: "ne_postoji", example: "sxy" },
        city: { example: "Beograd" },
        river: { example: `S${"a".repeat(45)}` },
      }),
    );
    expect(result.ok && result.notes).toMatchObject({
      examplesDropped: 3,
      droppedSameAsAnswer: 1,
      droppedWrongLetter: 1,
      droppedTooLong: 1,
    });
  });

  it("keeps the eight lines in sheet order and sums the points", () => {
    const { validate, reply } = setup("S", { country: "Srbija", city: "Sombor" });
    const result = validate(
      reply({
        country: { verdict: "accepted", recognizedSr: "Srbija", recognizedEn: "Serbia" },
        city: { verdict: "accepted", recognizedSr: "Sombor", recognizedEn: "Sombor" },
      }),
    );
    expect(result.ok && result.value.lines.map((line) => line.category)).toEqual([...CATEGORIES]);
    expect(result.ok && result.value.points).toBe(20);
  });
});
